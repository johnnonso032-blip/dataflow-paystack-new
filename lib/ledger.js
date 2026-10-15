const store = require("./store");

const DEBIT_SCRIPT =
  "local b = tonumber(redis.call('GET', KEYS[1]) or '0') " +
  "local a = tonumber(ARGV[1]) " +
  "if b >= a then redis.call('DECRBY', KEYS[1], a) return 1 else return 0 end";

const CREDIT_ONCE_SCRIPT =
  "if redis.call('SET', KEYS[1], ARGV[1], 'NX') then " +
  "redis.call('INCRBY', KEYS[2], ARGV[2]) return 1 else return 0 end";

async function record(phone, key, obj) {
  await store.set("wtx:" + key, obj);
  await store.addToList("wlist:" + phone, Date.now(), key);
}

// Takes money off the wallet only if the balance is enough. All in one step.
async function debit(phone, amount) {
  const r = await store.cmd(["EVAL", DEBIT_SCRIPT, "1", "wallet:" + phone, String(amount)]);
  return Number(r) === 1;
}

// Puts money back, at most once for each order.
async function refundOnce(phone, reference, amount) {
  const at = new Date().toISOString();
  const r = await store.cmd([
    "EVAL", CREDIT_ONCE_SCRIPT, "2", "refund:" + reference, "wallet:" + phone,
    JSON.stringify({ phone: phone, amount: amount, at: at }), String(amount)
  ]);
  if (Number(r) === 1) {
    await record(phone, "RF-" + reference, {
      type: "refund", amount: amount, at: at, reference: reference
    });
    return true;
  }
  return false;
}

module.exports = {
  DEBIT_SCRIPT: DEBIT_SCRIPT,
  CREDIT_ONCE_SCRIPT: CREDIT_ONCE_SCRIPT,
  record: record,
  debit: debit,
  refundOnce: refundOnce
};
