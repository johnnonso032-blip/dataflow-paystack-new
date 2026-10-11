const { fulfil } = require("../lib/fulfil");
const store = require("../lib/store");

module.exports = async (req, res) => {
  try {
    const body = req.body || {};
    const ref = body.data && body.data.reference;
    if (body.event === "charge.success" && ref) {
      await store.set("hook:" + ref, { at: new Date().toISOString() });
      await fulfil(ref);
    }
    return res.status(200).json({ received: true });
  } catch (e) {
    return res.status(500).json({ received: false });
  }
};
