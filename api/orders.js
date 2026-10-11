const store = require("../lib/store");

module.exports = async (req, res) => {
  const saved = String(process.env.ADMIN_KEY || "").trim();
  const sent = String(req.query.key || "").trim();
  if (!saved || sent !== saved) {
    return res.status(401).json({
      error: "Not allowed",
      sentLength: sent.length,
      savedLength: saved.length
    });
  }
  try {
    const refs = await store.latest("orders", 50);
    const list = [];
    for (const ref of refs) {
      const o = await store.get("order:" + ref);
      const h = await store.get("hook:" + ref);
      if (o) {
        list.push({
          reference: o.reference, plan: o.plan, phone: o.phone,
          amount: o.amount, status: o.delivery, at: o.updatedAt,
          webhook: h ? h.at : null
        });
      }
    }
    res.status(200).json({ count: list.length, orders: list });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e).slice(0, 100) });
  }
};
