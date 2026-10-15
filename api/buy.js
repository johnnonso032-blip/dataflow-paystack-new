const store = require("../lib/store");
const auth = require("../lib/auth");
const prices = require("../lib/prices");
const ledger = require("../lib/ledger");
const pricing = require("../lib/pricing");
const supplier = require("../lib/supplier");
const wallet = require("../lib/wallet");

const PHONE = /^0[789][01]\d{8}$/;
const PENDING = ["pending", "initiated", "processing"];

function view(o) {
  return {
    reference: o.reference, status: o.delivery, plan: o.plan, phone: o.phone,
    amount: o.amount, createdAt: o.createdAt, refunded: !!o.refunded,
    message: o.delivery === "failed" ? "Delivery failed. Your wallet was refunded." : ""
  };
}

// Records what the supplier said. Refunds the wallet once if delivery truly failed.
async function apply(order, result) {
  if (order.delivery === "delivered" || order.delivery === "failed") return order;
  const st = String(result.status || "");
  order.detail = result.detail || order.detail || "";
  if (typeof result.commission === "number") order.commission = result.commission;
  if (typeof result.cost === "number") order.cost = result.cost;
  order.updatedAt = new Date().toISOString();
  if (st === "delivered") {
    order.delivery = "delivered";
  } else if (PENDING.indexOf(st) >= 0) {
    order.delivery = "pending";
  } else {
    order.delivery = "failed";
    await ledger.refundOnce(order.buyerPhone, order.reference, order.amount);
    order.refunded = true;
  }
  await store.set("order:" + order.reference, order);
  return order;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
  try {
    const s = await auth.session(req);
    if (!s) return res.status(401).json({ error: "Not logged in" });
    const user = s.user;
    const b = req.body || {};

    if (b.action === "buy") {
      const plan = prices.findPlan(String(b.planId || ""));
      const phone = String(b.phone || "").trim();
      const cref = String(b.clientRef || "");
      if (!plan) return res.status(400).json({ error: "Choose a valid amount." });
      if (!PHONE.test(phone)) return res.status(400).json({ error: "Enter a valid phone number." });
      if (!/^[A-Za-z0-9]{8,40}$/.test(cref)) return res.status(400).json({ error: "Bad request id." });

      const rstatus = user.reseller && user.reseller.status;
      if (rstatus === "suspended") {
        return res.status(403).json({ error: "Your reseller access is suspended. Contact support." });
      }
      if ((await store.incrWithExpiry("rl:buy:" + user.phone, 60)) > 20) {
        return res.status(429).json({ error: "Too many orders. Wait a minute." });
      }
      const isReseller = rstatus === "active";
      const charge = pricing.priceFor(plan, isReseller, await pricing.settings());
      const ref = "WP-" + cref;
      const order = {
        reference: ref, planId: plan.id, plan: plan.network + " " + plan.label,
        phone: phone, amount: charge, listPrice: plan.price,
        buyer: isReseller ? "reseller" : "customer", buyerPhone: user.phone,
        source: "wallet", delivery: "pending", createdAt: new Date().toISOString()
      };

      const claimed = await store.setNx("order:" + ref, order);
      if (!claimed) {
        const old = await store.get("order:" + ref);
        if (!old || old.buyerPhone !== user.phone) return res.status(409).json({ error: "Request id already used." });
        return res.status(200).json({ order: view(old), balance: await wallet.balance(user.phone) });
      }

      const paid = await ledger.debit(user.phone, charge);
      if (!paid) {
        await store.del("order:" + ref);
        return res.status(402).json({ error: "Insufficient balance. Fund your wallet first." });
      }
      await ledger.record(user.phone, ref, { type: "buy", amount: charge, at: order.createdAt, reference: ref, plan: order.plan });
      await store.addToList("orders", Date.parse(order.createdAt), ref);
      await store.addToList("uorders:" + user.phone, Date.parse(order.createdAt), ref);

      let result;
      try {
        result = await supplier.deliver(plan, phone, supplier.makeRequestId(order.createdAt, ref));
      } catch (e) {
        result = { status: "pending", detail: "supplier unreachable" };
      }
      if (result.status === "failed" && /HTTP|unreachable|error/i.test(result.detail || "")) {
        result.status = "pending";
      }
      await apply(order, result);
      return res.status(200).json({ order: view(order), balance: await wallet.balance(user.phone) });
    }

    if (b.action === "status") {
      const ref = String(b.reference || "");
      if (!/^WP-[A-Za-z0-9]+$/.test(ref)) return res.status(400).json({ error: "Bad reference" });
      const order = await store.get("order:" + ref);
      if (!order || order.buyerPhone !== user.phone) return res.status(404).json({ error: "Order not found" });
      if (order.delivery === "pending") {
        let chk = { status: "unknown" };
        try { chk = await supplier.check(supplier.makeRequestId(order.createdAt, ref)); } catch (e) {}
        if (chk.status !== "unknown") await apply(order, chk);
      }
      return res.status(200).json({ order: view(order), balance: await wallet.balance(user.phone) });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (e) {
    return res.status(500).json({ error: "Server error" });
  }
};
