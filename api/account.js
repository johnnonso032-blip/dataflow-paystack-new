const store = require("../lib/store");
const auth = require("../lib/auth");

const PHONE = /^0[789][01]\d{8}$/;

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
  const b = req.body || {};
  try {
    if (b.action === "signup") {
      const ip = String(req.headers["x-forwarded-for"] || "ip").split(",")[0].trim();
      if ((await store.incrWithExpiry("rl:signup:" + ip, 3600)) > 10) {
        return res.status(429).json({ error: "Too many sign-ups. Try again later." });
      }
      const phone = String(b.phone || "").replace(/\s+/g, "");
      const name = String(b.name || "").trim().slice(0, 40);
      const pw = String(b.password || "");
      if (!PHONE.test(phone)) return res.status(400).json({ error: "Enter a valid phone number." });
      if (name.length < 2) return res.status(400).json({ error: "Enter your name." });
      if (pw.length < 6 || pw.length > 100) {
        return res.status(400).json({ error: "Password must be 6 to 100 characters." });
      }
      const salt = auth.newSalt();
      const user = {
        phone: phone, name: name, role: "customer", salt: salt,
        hash: auth.hash(pw, salt), createdAt: new Date().toISOString()
      };
      const created = await store.setNx("user:" + phone, user);
      if (!created) {
        return res.status(409).json({ error: "This phone number already has an account. Log in instead." });
      }
      await store.addToList("users", Date.now(), phone);
      return res.status(200).json({ token: await auth.newSession(phone), user: auth.pub(user) });
    }

    if (b.action === "login") {
      const phone = String(b.phone || "").replace(/\s+/g, "");
      const pw = String(b.password || "");
      if (!PHONE.test(phone)) return res.status(400).json({ error: "Enter a valid phone number." });
      const limitKey = "rl:login:" + phone;
      if ((await store.incrWithExpiry(limitKey, 900)) > 8) {
        return res.status(429).json({ error: "Too many attempts. Try again in 15 minutes." });
      }
      const u = await store.get("user:" + phone);
      const salt = u ? u.salt : "00000000000000000000000000000000";
      const stored = u ? u.hash : "0".repeat(128);
      const ok = auth.same(auth.hash(pw, salt), stored) && !!u;
      if (!ok) return res.status(401).json({ error: "Wrong phone number or password." });
      await store.del(limitKey);
      return res.status(200).json({ token: await auth.newSession(phone), user: auth.pub(u) });
    }

    const s = await auth.session(req);
    if (!s) return res.status(401).json({ error: "Not logged in" });

    if (b.action === "me") return res.status(200).json({ user: auth.pub(s.user) });

    if (b.action === "logout") {
      await store.del("sess:" + s.token);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (e) {
    return res.status(500).json({ error: "Server error" });
  }
};
