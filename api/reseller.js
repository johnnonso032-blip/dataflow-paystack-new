const store = require("../lib/store");
const auth = require("../lib/auth");
const wallet = require("../lib/wallet");
const pricing = require("../lib/pricing");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
  try {
    const s = await auth.session(req);
    if (!s) return res.status(401).json({ error: "Not logged in" });
    const user = s.user;
    const b = req.body || {};
    const r = user.reseller || null;
    const set = await pricing.settings();
    const prices = { airtimePct: set.airtimePct, dataPct: set.dataPct };

    if (b.action === "status") {
      return res.status(200).json({
        status: r ? r.status : "none",
        businessName: r ? r.businessName : "",
        prices: prices,
        hasEmail: !!user.email,
        auto: set.autoApprove === true
      });
    }

    if (b.action === "register") {
      if (r && r.status !== "none") return res.status(409).json({ error: "You already applied.", status: r.status });
      const name = String(b.businessName || "").trim().slice(0, 40);
      if (name.length < 2) return res.status(400).json({ error: "Enter your business or shop name." });
      if (!user.email) return res.status(400).json({ error: "Add your email to your account first.", needEmail: true });
      const auto = set.autoApprove === true;
      const now = new Date().toISOString();
      user.reseller = { status: auto ? "active" : "pending", businessName: name, requestedAt: now };
      if (auto) { user.reseller.approvedAt = now; user.reseller.auto = true; }
      await store.set("user:" + user.phone, user);
      await store.addToList("resellers", Date.now(), user.phone);
      return res.status(200).json({ status: user.reseller.status, businessName: name, prices: prices, auto: auto });
    }

    if (b.action === "dashboard") {
      if (!r || r.status !== "active") return res.status(403).json({ error: "Reseller access is not active." });
      const refs = await store.latest("uorders:" + user.phone, 200);
      const orders = (await Promise.all(refs.map(function (x) { return store.get("order:" + x); }))).filter(Boolean);
      const done = orders.filter(function (o) { return o.delivery === "delivered"; });
      const sum = function (a, f) { return a.reduce(function (t, o) { return t + Number(f(o) || 0); }, 0); };
      const w = await wallet.summary(user.phone);
      return res.status(200).json({
        businessName: r.businessName,
        balance: w.balance,
        history: w.history,
        prices: prices,
        stats: {
          orders: orders.length,
          delivered: done.length,
          pending: orders.filter(function (o) { return o.delivery === "pending"; }).length,
          failed: orders.filter(function (o) { return o.delivery === "failed"; }).length,
          sales: sum(done, function (o) { return o.listPrice; }),
          spent: sum(done, function (o) { return o.amount; }),
          earnings: sum(done, function (o) { return Number(o.listPrice) - Number(o.amount); })
        },
        recent: orders.slice(0, 20).map(function (o) {
          return { reference: o.reference, plan: o.plan, phone: o.phone, amount: o.amount,
                   listPrice: o.listPrice, status: o.delivery, createdAt: o.createdAt };
        })
      });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (e) {
    return res.status(500).json({ error: "Server error" });
  }
};
