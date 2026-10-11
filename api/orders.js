const store = require("../lib/store");

module.exports = async (req, res) => {
  if (!process.env.ADMIN_KEY || req.query.key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "Not allowed" });
  }
  try {
    const refs = await store.latest("orders", 50);
    const list = [];
    for (const ref of refs) {
      const o = await store.get("order:" + ref);
      if (o) {
        list.push({
          reference: o.reference, plan: o.plan, phone: o.phone,
          amount: o.amount, status: o.delivery, at: o.updatedAt
        });
      }
    }
    res.status(200).json({ count: list.length, orders: list });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e).slice(0, 100) });
  }
};
