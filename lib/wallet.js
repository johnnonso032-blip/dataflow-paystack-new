const store = require("./store");

const CREDIT_SCRIPT =
  "if redis.call('SET', KEYS[1], ARGV[1], 'NX') then " +
  "redis.call('INCRBY', KEYS[2], ARGV[2]) return 1 else return 0 end";

function getField(tx, name) {
  const fields = (tx.metadata && tx.metadata.custom_fields) || [];
  const f = fields.find(function (x) { return x.variable_name === name; });
  return f ? String(f.value).trim() : "";
}

async function balance(phone) {
  const v = await store.cmd(["GET", "wallet:" + phone]);
  return Number(v || 0);
}

async function history(phone) {
  const refs = await store.latest("wlist:" + phone, 10);
  const items = await Promise.all(refs.map(function (ref) {
    return store.get("wtx:" + ref);
  }));
  return items.filter(Boolean);
}

async function summary(phone) {
  return { balance: await balance(phone), history: await history(phone) };
}

async function fundFromPaystack(reference, onlyPhone) {
  const r = await fetch(
    "https://api.paystack.co/transaction/verify/" + encodeURIComponent(reference),
    { headers: { Authorization: "Bearer " + process.env.PAYSTACK_SECRET_KEY } }
  );
  const data = await r.json();
  if (!data.status || !data.data) {
    return { ok: false, message: data.message || "Payment not found" };
  }
  const tx = data.data;
  if (tx.status !== "success") {
    const waiting = tx.status === "pending" || tx.status === "ongoing" || tx.status === "processing";
    return { ok: false, pending: waiting, message: "Payment is " + tx.status };
  }
  if (getField(tx, "purpose") !== "wallet") {
    return { ok: false, message: "This is not a wallet payment" };
  }
  const phone = getField(tx, "wallet_phone");
  if (!/^0[789][01]\d{8}$/.test(phone)) {
    return { ok: false, message: "No valid account on this payment" };
  }
  if (onlyPhone && onlyPhone !== phone) {
    return { ok: false, message: "This payment belongs to another account" };
  }
  const user = await store.get("user:" + phone);
  if (!user) return { ok: false, message: "No account found for this payment" };

  const amount = Math.round(tx.amount / 100);
  if (amount < 100 || amount > 500000) {
    return { ok: false, message: "Amount is out of range" };
  }

  const at = new Date().toISOString();
  const done = await store.cmd([
    "EVAL", CREDIT_SCRIPT, "2", "fund:" + reference, "wallet:" + phone,
    JSON.stringify({ phone: phone, amount: amount, at: at }), String(amount)
  ]);
  if (Number(done) === 1) {
    await store.set("wtx:" + reference, { type: "fund", amount: amount, at: at, reference: reference });
    await store.addToList("wlist:" + phone, Date.now(), reference);
    return { ok: true, credited: true, amount: amount };
  }
  return { ok: true, credited: false, amount: amount, message: "Already added" };
}

module.exports = { balance: balance, summary: summary, fundFromPaystack: fundFromPaystack };
