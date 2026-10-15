const store = require("../lib/store");
const pricing = require("../lib/pricing");

function pct(x, fallback) {
  const n = Number(x);
  return isFinite(n) && n >= 0 && n <= 10 ? Math.round(n * 100) / 100 : fallback;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
  const saved = String(process.env.ADMIN_KEY || "").trim();
  const sent = String(req.headers["x-admin-key"] || "").trim();
  if (!saved || sent !== saved) return res.status(401).json({ error: "Not allowed" });
  const b = req.body || {};
  try {
    if (b.action === "setReseller") {
      const phone = String(b.phone || "");
      const status = String(b.status || "");
      if (["active", "suspended", "none"].indexOf(status) < 0) return res.status(400).json({ error: "Bad status" });
      const u = await store.get("user:" + phone);
      if (!u) return res.status(404).json({ error: "User not found" });
      const r = u.reseller || { businessName: "", requestedAt: new Date().toISOString() };
      r.status = status;
      if (status === "active") r.approvedAt = new Date().toISOString();
      u.reseller = r;
      await store.set("user:" + phone, u);
      await store.addToList("resellers", Date.now(), phone);
      return res.status(200).json({ ok: true });
    }

    if (b.action === "setPricing") {
      const cur = await pricing.settings();
      const next = {
        airtimePct: pct(b.airtimePct, cur.airtimePct),
        dataPct: pct(b.dataPct, cur.dataPct),
        commissionPct: pct(b.commissionPct, cur.commissionPct)
      };
      await store.set("settings:pricing", next);
      return res.status(200).json({ ok: true, settings: next });
    }

    if (b.action === "overview") {
      const set = await pricing.settings();
      const phones = await store.latest("users", 300);
      const orderRefs = await store.latest("orders", 500);
      const mget = async function (keys) {
        if (!keys.length) return [];
        const r = await store.cmd(["MGET"].concat(keys));
        return r.map(function (v) { return v ? JSON.parse(v) : null; });
      };
      const users = (await mget(phones.map(function (p) { return "user:" + p; }))).filter(Boolean);
      const bal = phones.length ? await store.cmd(["MGET"].concat(phones.map(function (p) { return "wallet:" + p; }))) : [];
      const balOf = {};
      phones.forEach(function (p, i) { balOf[p] = Number(bal[i] || 0); });
      const orders = (await mget(orderRefs.map(function (r) { return "order:" + r; }))).filter(Boolean);
      const hooks = orderRefs.length ? await store.cmd(["MGET"].concat(orderRefs.map(function (r) { return "hook:" + r; }))) : [];
      const hooked = hooks.filter(Boolean).length;

      const per = {};
      orders.forEach(function (o) {
        if (!o.buyerPhone) return;
        const x = per[o.buyerPhone] || (per[o.buyerPhone] = { orders: 0, sales: 0 });
        x.orders++;
        if (o.delivery === "delivered") x.sales += Number(o.amount || 0);
      });

      return res.status(200).json({
        settings: set,
        hooked: hooked,
        users: users.map(function (u) {
          return {
            name: u.name, phone: u.phone, createdAt: u.createdAt,
            reseller: u.reseller ? { status: u.reseller.status, businessName: u.reseller.businessName, requestedAt: u.reseller.requestedAt } : null,
            balance: balOf[u.phone] || 0,
            orders: (per[u.phone] || {}).orders || 0,
            sales: (per[u.phone] || {}).sales || 0
          };
        }),
        orders: orders.map(function (o) {
          return {
            reference: o.reference, plan: o.plan, phone: o.phone, amount: o.amount,
            listPrice: o.listPrice || o.amount, status: o.delivery,
            buyer: o.buyer || "customer", buyerPhone: o.buyerPhone || "",
            source: o.source || "paystack", createdAt: o.createdAt, detail: o.detail || "",
            refunded: !!o.refunded,
            cost: typeof o.cost === "number" ? o.cost : null,
            commission: typeof o.commission === "number" ? o.commission : null
          };
        })
      });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (e) {
    return res.status(500).json({ error: "Server error" });
  }
};
