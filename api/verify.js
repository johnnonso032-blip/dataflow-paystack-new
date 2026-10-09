const { findPlan } = require("../lib/prices");

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
  try {
    return JSON.parse(text);
  } catch (e) {
    return { code: "HTTP " + r.status, response_description: text.slice(0, 120) };
  }
}

function makeRequestId(paidAt, reference) {
  const lagos = new Date(new Date(paidAt).getTime() + 60 * 60 * 1000);
  const stamp = lagos.toISOString().replace(/\D/g, "").slice(0, 12);
  return stamp + reference.replace(/[^A-Za-z0-9]/g, "");
}

function getPhone(tx) {
  const fields = (tx.metadata && tx.metadata.custom_fields) || [];
  const f = fields.find(function (x) { return x.variable_name === "phone"; });
  return f ? String(f.value).trim() : "";
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
  } catch (e) {
    note = "requery error";
  }

  const body = plan.vt.airtime
    ? { request_id: requestId, serviceID: plan.vt.serviceID, amount: plan.price, phone: phone }
    : { request_id: requestId, serviceID: plan.vt.serviceID, billersCode: phone,
        variation_code: plan.vt.code, phone: phone };

  const p = await vtPost("/pay", body);
  const t = p && p.content && p.content.transactions;
  const detail = describe("pay", p) + " | " + note + " | id " + requestId;
  if (t && t.status) return { status: t.status, detail: detail };
  if (p && p.code === "099") return { status: "pending", detail: detail };
  return { status: "failed", detail: detail };
}

module.exports = async (req, res) => {
  const reference = req.query.reference;
  const plan = findPlan(req.query.planId);

  if (!reference || !plan) {
    return res.status(400).json({ status: "error", message: "Missing reference or plan" });
  }
  if (!process.env.PAYSTACK_SECRET_KEY || !process.env.VTPASS_API_KEY || !process.env.VTPASS_SECRET_KEY) {
    return res.status(500).json({ status: "error", message: "Server keys not set" });
  }

  try {
    const r = await fetch(
      "https://api.paystack.co/transaction/verify/" + encodeURIComponent(reference),
      { headers: { Authorization: "Bearer " + process.env.PAYSTACK_SECRET_KEY } }
    );
    const data = await r.json();

    if (!data.status || !data.data) {
      return res.status(200).json({ status: "failed", message: data.message || "Transaction reference not found" });
    }

    const tx = data.data;
    if (tx.status === "abandoned") return res.status(200).json({ status: "abandoned" });
    if (tx.status === "pending" || tx.status === "ongoing" || tx.status === "processing") {
      return res.status(200).json({ status: "pending" });
    }
    if (tx.status !== "success") {
      return res.status(200).json({ status: "failed", message: tx.gateway_response || "Payment failed" });
    }
    if (tx.amount !== plan.price * 100) {
      return res.status(200).json({ status: "failed", message: "Amount does not match plan price" });
    }

    const phone = getPhone(tx);
    if (!/^0[789][01]\d{8}$/.test(phone)) {
      return res.status(200).json({ status: "failed", message: "Invalid phone on payment: [" + phone + "]" });
    }

    const requestId = makeRequestId(tx.paid_at || new Date().toISOString(), reference);
    const result = await deliver(plan, phone, requestId);

    if (result.status === "delivered") return res.status(200).json({ status: "success" });
    if (result.status === "pending" || result.status === "initiated" || result.status === "processing") {
      return res.status(200).json({ status: "pending", message: "Paid. Delivery is processing. " + result.detail });
    }
    return res.status(200).json({ status: "failed", message: "Paid but delivery failed. " + result.detail });
  } catch (e) {
    return res.status(500).json({ status: "error", message: "Server error" });
  }
};
