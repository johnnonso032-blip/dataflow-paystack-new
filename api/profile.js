const store = require("../lib/store");
const auth = require("../lib/auth");
const emailLib = require("../lib/email");

const JPEG = /^data:image\/jpeg;base64,([A-Za-z0-9+\/]+={0,2})$/;
const MAX_AVATAR = 60000;

function validAvatar(s) {
  if (typeof s !== "string" || s.length > MAX_AVATAR) return false;
  const m = JPEG.exec(s);
  if (!m) return false;
  const head = Buffer.from(m[1].slice(0, 8), "base64");
  return head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
  try {
    const s = await auth.session(req);
    if (!s) return res.status(401).json({ error: "Not logged in" });
    const user = s.user;
    const b = req.body || {};

    if (b.action === "get") {
      return res.status(200).json({ name: user.name, phone: user.phone, avatar: user.avatar || "", email: user.email || "" });
    }

    if (b.action === "setEmail") {
      if (user.email) return res.status(409).json({ error: "Your account already has an email." });
      if ((await store.incrWithExpiry("rl:email:" + user.phone, 3600)) > 10) {
        return res.status(429).json({ error: "Too many attempts. Try again later." });
      }
      const em = emailLib.normalize(b.email);
      if (!em) return res.status(400).json({ error: "Enter a valid email address." });
      if (!(await emailLib.claim(em, user.phone))) {
        return res.status(409).json({ error: "This email already belongs to another account." });
      }
      user.email = em.display;
      user.emailKey = em.key;
      await store.set("user:" + user.phone, user);
      return res.status(200).json({ email: user.email });
    }

    if (b.action === "setAvatar") {
      if ((await store.incrWithExpiry("rl:avatar:" + user.phone, 3600)) > 10) {
        return res.status(429).json({ error: "Too many photo changes. Try again later." });
      }
      if (!validAvatar(b.avatar)) return res.status(400).json({ error: "That photo could not be used. Try another." });
      user.avatar = b.avatar;
      await store.set("user:" + user.phone, user);
      return res.status(200).json({ avatar: user.avatar });
    }

    if (b.action === "removeAvatar") {
      delete user.avatar;
      await store.set("user:" + user.phone, user);
      return res.status(200).json({ avatar: "" });
    }

    if (b.action === "changePassword") {
      const cur = String(b.currentPassword || "");
      const next = String(b.newPassword || "");
      if ((await store.incrWithExpiry("rl:chpw:" + user.phone, 900)) > 6) {
        return res.status(429).json({ error: "Too many attempts. Try again in 15 minutes." });
      }
      if (next.length < 6 || next.length > 100) {
        return res.status(400).json({ error: "New password must be 6 to 100 characters." });
      }
      if (!auth.same(auth.hash(cur, user.salt), user.hash)) {
        return res.status(401).json({ error: "Your current password is wrong." });
      }
      user.salt = auth.newSalt();
      user.hash = auth.hash(next, user.salt);
      user.revokedAt = Date.now();
      await store.set("user:" + user.phone, user);
      await store.del("sess:" + s.token);
      await store.del("rl:chpw:" + user.phone);
      return res.status(200).json({ ok: true, token: await auth.newSession(user.phone) });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (e) {
    return res.status(500).json({ error: "Server error" });
  }
};
