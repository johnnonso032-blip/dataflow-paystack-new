const store = require("../lib/store");

module.exports = async (req, res) => {
  const saved = String(process.env.ADMIN_KEY || "").trim();
  const sent = String(req.headers["x-admin-key"] || req.query.key || "").trim();
  if (!saved || sent !== saved) {
    return res.status(401).json({ error: "Not allowed" });
  }
  try {
    const refs = await store.latest("orders", 200);
    const list = await Promise.all(refs.map(async function (ref) {
      const o = await store.get("order:" + ref);
      const h = await store.get("hook:" + ref);
      if (!o) return null;
      return {
        reference: o.reference, plan: o.plan, phone: o.phone,
        amount: o.amount, status: o.delivery, createdAt: o.createdAt,
        at: o.updatedAt, detail: o.detail || "", webhook: h ? h.at : null,
        buyer: o.buyer || "customer",
        commission: typeof o.commission === "number" ? o.commission : null,
        cost: typeof o.cost === "number" ? o.cost : null
      };
    }));
    const orders = list.filter(Boolean);
    let users = 0;
    try { users = Number(await store.cmd(["ZCARD", "users"])) || 0; } catch (e) {}
    res.status(200).json({ count: orders.length, users: users, orders: orders });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e).slice(0, 100) });
  }
};
