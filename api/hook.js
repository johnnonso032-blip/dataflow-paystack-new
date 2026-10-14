const { fulfil } = require("../lib/fulfil");
const wallet = require("../lib/wallet");
const store = require("../lib/store");

module.exports = async (req, res) => {
  try {
    const body = req.body || {};
    const ref = body.data && body.data.reference;
    if (body.event === "charge.success" && ref) {
      await store.set("hook:" + ref, { at: new Date().toISOString() });
      const fields = (body.data.metadata && body.data.metadata.custom_fields) || [];
      const purpose = fields.find(function (x) { return x.variable_name === "purpose"; });
      if (purpose && String(purpose.value) === "wallet") {
        await wallet.fundFromPaystack(ref);
      } else {
        await fulfil(ref);
      }
    }
    return res.status(200).json({ received: true });
  } catch (e) {
    return res.status(500).json({ received: false });
  }
};
