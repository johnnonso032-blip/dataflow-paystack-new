const store = require("./store");
const prices = require("./prices");
const supplier = require("./supplier");
const pay = require("./paystack");

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

function outcome(order) {
  if (order.delivery === "delivered") return { status: "success" };
  if (order.delivery === "pending" || order.delivery === "initiated" || order.delivery === "processing") {
    return { status: "pending", message: "Paid. Delivery is processing." };
  }
  return { status: "failed", message: "Paid but delivery failed. Refund needed. " + (order.detail || "") };
}

// The product and price come only from the verified Paystack payment and the
// server's own price list. Nothing from the browser address is used.
async function fulfil(reference) {
  const v = await pay.verify(reference);
  if (!v.ok) {
    if (v.config) return { status: "error", message: v.message };
    return { status: "failed", message: v.message };
  }
  const tx = v.tx;
  if (tx.status === "abandoned") return { status: "abandoned" };
  if (tx.status === "pending" || tx.status === "ongoing" || tx.status === "processing") {
    return { status: "pending" };
  }
  if (tx.status !== "success") {
    return { status: "failed", message: tx.gateway_response || "Payment failed" };
  }
  const money = pay.badMoney(tx);
  if (money) return { status: "failed", message: money };

  const plan = planFromText(getField(tx, "plan"));
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
      buyer: "customer",
      mode: tx.domain || pay.keyMode(),
      createdAt: tx.paid_at || new Date().toISOString()
    };
    if (order.delivery === "delivered") return { status: "success" };

    const result = await supplier.deliver(plan, phone, supplier.makeRequestId(order.createdAt, reference));
    order.delivery = result.status;
    order.detail = result.detail;
    if (result.commission !== null && result.commission !== undefined) order.commission = result.commission;
    if (result.cost !== null && result.cost !== undefined) order.cost = result.cost;
    order.updatedAt = new Date().toISOString();
    await store.set(key, order);
    await store.addToList("orders", Date.parse(order.createdAt) || Date.now(), reference);
    return outcome(order);
  } finally {
    await store.unlock("lock:" + reference);
  }
}

module.exports = { fulfil: fulfil };
