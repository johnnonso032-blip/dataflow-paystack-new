const store = require("./store");
const prices = require("./prices");

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

function makeRequestId(paidAt, reference) {
  const lagos = new Date(new Date(paidAt).getTime() + 60 * 60 * 1000);
  const stamp = lagos.toISOString().replace(/\D/g, "").slice(0, 12);
  return stamp + reference.replace(/[^A-Za-z0-9]/g, "");
}

function getField(tx, name) {
  const fields = (tx.metadata && tx.metadata.custom_fields) || [];
  const f = fields.find(function (x) { return x.variable_name === name; });
  return f ? String(f.value).trim() : "";
}

function planFromText(text) {
  for (const net in prices.NETWORKS) {
    for (const p of prices.NETWORKS[net]) {
      if (net + " " + p.label === text) return prices.findPlan(p.id);
    }
  }
  return null;
}

function describe(step, r) {
  return step + ": " + (r.code || "") + " " + (r.response_description || "");
}

async function deliver(plan, phone, requestId) {
  let note = "";
  try {
    const q = await vtPost("/requery", { request_id: requestId });
    const t = q && q.content && q.content.transactions;
    note = describe("requery", q);
    if (t && t.status) return { status: t.status, detail: note };
  } catch (e) { note = "requery error"; }

  const body = plan.vt.airtime
    ? { request_id: requestId, serviceID: plan.vt.serviceID, amount: plan.price, phone: phone }
    : { request_id: requestId, serviceID: plan.vt.serviceID, billersCode: phone,
        variation_code: plan.vt.code, phone: phone };

  const p = await vtPost("/pay", body);
  const t = p && p.content && p.content.transactions;
  const detail = describe("pay", p) + " | " + note;
  if (t && t.status) return { status: t.status, detail: detail };
  if (p && p.code === "099") return { status: "pending", detail: detail };
  return { status: "failed", detail: detail };
}

function outcome(order) {
  if (order.delivery === "delivered") return { status: "success" };
  if (order.delivery === "pending" || order.delivery === "initiated" || order.delivery === "processing") {
    return { status: "pending", message: "Paid. Delivery is processing." };
  }
  return { status: "failed", message: "Paid but delivery failed. Refund needed. " + (order.detail || "") };
}

async function fulfil(reference, planIdHint) {
  const r = await fetch(
    "https://api.paystack.co/transaction/verify/" + encodeURIComponent(reference),
    { headers: { Authorization: "Bearer " + process.env.PAYSTACK_SECRET_KEY } }
  );
  const data = await r.json();
  if (!data.status || !data.data) {
    return { status: "failed", message: data.message || "Transaction reference not found" };
  }

  const tx = data.data;
  if (tx.status === "abandoned") return { status: "abandoned" };
  if (tx.status === "pending" || tx.status === "ongoing" || tx.status === "processing") {
    return { status: "pending" };
  }
  if (tx.status !== "success") {
    return { status: "failed", message: tx.gateway_response || "Payment failed" };
  }

  const plan = (planIdHint && prices.findPlan(planIdHint)) || planFromText(getField(tx, "plan"));
  if (!plan) return { status: "failed", message: "Unknown plan on payment" };
  if (tx.amount !== plan.price * 100) {
    return { status: "failed", message: "Amount does not match plan price" };
  }
  const phone = getField(tx, "phone");
  if (!/^0[789][01]\d{8}$/.test(phone)) {
    return { status: "failed", message: "Invalid phone number on payment" };
  }

  const key = "order:" + reference;
  let order = await store.get(key);
  if (order && order.delivery === "delivered") return { status: "success" };

  const gotLock = await store.lock("lock:" + reference, 60);
  if (!gotLock) return { status: "pending", message: "Another check is running" };

  try {
    order = (await store.get(key)) || {
      reference: reference,
      planId: plan.id,
      plan: plan.network + " " + plan.label,
      phone: phone,
      amount: plan.price,
      email: (tx.customer && tx.customer.email) || "",
      createdAt: tx.paid_at || new Date().toISOString()
    };
    if (order.delivery === "delivered") return { status: "success" };

    const result = await deliver(plan, phone, makeRequestId(order.createdAt, reference));
    order.delivery = result.status;
    order.detail = result.detail;
    order.updatedAt = new Date().toISOString();
    await store.set(key, order);
    await store.addToList("orders", Date.parse(order.createdAt) || Date.now(), reference);
    return outcome(order);
  } finally {
    await store.unlock("lock:" + reference);
  }
}

module.exports = { fulfil: fulfil };
