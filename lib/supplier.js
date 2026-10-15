const BASE = process.env.VTPASS_BASE_URL || "https://sandbox.vtpass.com/api";

async function vtPost(path, body) {
  const r = await fetch(BASE + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": process.env.VTPASS_API_KEY,
      "secret-key": process.env.VTPASS_SECRET_KEY
    },
    body: JSON.stringify(body)
  });
  const text = await r.text();
  try { return JSON.parse(text); }
  catch (e) { return { code: "HTTP " + r.status, response_description: text.slice(0, 120) }; }
}

function makeRequestId(createdAt, reference) {
  const lagos = new Date(new Date(createdAt).getTime() + 60 * 60 * 1000);
  const stamp = lagos.toISOString().replace(/\D/g, "").slice(0, 12);
  return stamp + reference.replace(/[^A-Za-z0-9]/g, "");
}

function describe(step, r) {
  return step + ": " + (r.code || "") + " " + (r.response_description || "");
}

function num(x) {
  const n = Number(x);
  return x !== null && x !== undefined && x !== "" && isFinite(n) ? n : null;
}

function pick(t) {
  return { commission: num(t && t.commission), cost: num(t && t.total_amount) };
}

async function deliver(plan, phone, requestId) {
  let note = "";
  try {
    const q = await vtPost("/requery", { request_id: requestId });
    const t = q && q.content && q.content.transactions;
    note = describe("requery", q);
    if (t && t.status) return Object.assign({ status: t.status, detail: note }, pick(t));
  } catch (e) { note = "requery error"; }

  const body = plan.vt.airtime
    ? { request_id: requestId, serviceID: plan.vt.serviceID, amount: plan.price, phone: phone }
    : { request_id: requestId, serviceID: plan.vt.serviceID, billersCode: phone,
        variation_code: plan.vt.code, phone: phone };

  const p = await vtPost("/pay", body);
  const t = p && p.content && p.content.transactions;
  const detail = describe("pay", p) + " | " + note;
  if (t && t.status) return Object.assign({ status: t.status, detail: detail }, pick(t));
  if (p && p.code === "099") return { status: "pending", detail: detail };
  return { status: "failed", detail: detail };
}

// Ask the supplier what happened to an order. Never guesses.
async function check(requestId) {
  const q = await vtPost("/requery", { request_id: requestId });
  const t = q && q.content && q.content.transactions;
  if (t && t.status) return Object.assign({ status: t.status, detail: describe("requery", q) }, pick(t));
  return { status: "unknown", detail: describe("requery", q) };
}

module.exports = { deliver: deliver, check: check, makeRequestId: makeRequestId };
