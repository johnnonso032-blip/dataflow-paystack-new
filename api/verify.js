const { fulfil } = require("../lib/fulfil");

module.exports = async (req, res) => {
  const reference = req.query.reference;
  if (!reference) {
    return res.status(400).json({ status: "error", message: "Missing reference" });
  }
  if (!process.env.PAYSTACK_SECRET_KEY || !process.env.VTPASS_API_KEY || !process.env.VTPASS_SECRET_KEY) {
    return res.status(500).json({ status: "error", message: "Server keys not set" });
  }
  try {
    const out = await fulfil(reference, req.query.planId);
    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ status: "error", message: "Server error: " + String(e.message || e).slice(0, 100) });
  }
};
