const store = require("./store");

// Turns an email into one standard form, so the same mailbox cannot be
// registered twice with capital letters, +tags or Gmail dots.
function normalize(raw) {
  const e = String(raw || "").trim().toLowerCase();
  if (e.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return null;
  const parts = e.split("@");
  if (parts.length !== 2) return null;
  let local = parts[0].split("+")[0];
  let domain = parts[1];
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  if (!local) return null;
  return { display: e, key: local + "@" + domain };
}

// Reserves the email for one phone number. Returns true if it is now ours.
async function claim(em, phone) {
  const ok = await store.setNx("email:" + em.key, { phone: phone });
  if (ok) return true;
  const owner = await store.get("email:" + em.key);
  return !!owner && owner.phone === phone;
}

async function release(em) {
  await store.del("email:" + em.key);
}

module.exports = { normalize: normalize, claim: claim, release: release };
