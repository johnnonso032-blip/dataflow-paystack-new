const auth = require("../lib/auth");
const wallet = require("../lib/wallet");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
  try {
    const s = await auth.session(req);
    if (!s) return res.status(401).json({ error: "Not logged in" });
    const phone = s.user.phone;
    const b = req.body || {};

    if (b.action === "balance") {
      return res.status(200).json(await wallet.summary(phone));
    }

    if (b.action === "fund") {
      const ref = String(b.reference || "");
      if (!/^WAL-[A-Za-z0-9-]+$/.test(ref)) {
        return res.status(400).json({ error: "Bad reference" });
      }
      const out = await wallet.fundFromPaystack(ref, phone);
      const sum = await wallet.summary(phone);
      return res.status(200).json(Object.assign({}, out, sum));
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (e) {
    return res.status(500).json({ error: "Server error" });
  }
};
