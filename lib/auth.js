const crypto = require("crypto");
const store = require("./store");

module.exports = {
  newSalt: function () {
    return crypto.randomBytes(16).toString("hex");
  },
  hash: function (pw, salt) {
    return crypto.scryptSync(pw, salt, 64).toString("hex");
  },
  same: function (a, b) {
    const x = Buffer.from(a, "hex");
    const y = Buffer.from(b, "hex");
    return x.length === y.length && crypto.timingSafeEqual(x, y);
  },
  pub: function (u) {
    return { name: u.name, phone: u.phone, role: u.role };
  },
  newSession: async function (phone) {
    const token = crypto.randomBytes(24).toString("hex");
    await store.setEx("sess:" + token, { phone: phone, at: Date.now() }, 60 * 60 * 24 * 30);
    return token;
  },
  session: async function (req) {
    const h = String(req.headers.authorization || "");
    const token = h.indexOf("Bearer ") === 0 ? h.slice(7).trim() : "";
    if (!token) return null;
    const s = await store.get("sess:" + token);
    if (!s) return null;
    const user = await store.get("user:" + s.phone);
    if (!user) return null;
    // A password change or reset logs out every older session.
    if (user.revokedAt && Number(s.at || 0) < user.revokedAt) return null;
    return { user: user, token: token };
  }
};
