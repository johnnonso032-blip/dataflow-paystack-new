const store = require("../lib/store");

module.exports = async (req, res) => {
  try {
    await store.set("dbcheck", { hello: "world", at: new Date().toISOString() });
    const back = await store.get("dbcheck");
    res.status(200).json({ ok: true, back: back });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
};
