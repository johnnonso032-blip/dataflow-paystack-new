const { PLANS } = require("../lib/prices");

module.exports = async (req, res) => {
  const body = req.body || {};
  const reference = req.query.reference || body.reference;
  const planId = req.query.plan || body.plan;
  const plan = PLANS[planId];

  if (!reference || !plan) {
    return res.status(400).json({ status: "failed", error: "Missing reference or plan" });
  }

  try {
    const r = await fetch(
      "https://api.paystack.co/transaction/verify/" + encodeURIComponent(reference),
      { headers: { Authorization: "Bearer " + process.env.PAYSTACK_SECRET_KEY } }
    );
    const data = await r.json();
    const tx = data.data;

    if (!data.status || !tx) {
      return res.status(200).json({ status: "failed" });
    }
    if (tx.status === "success" && tx.amount === plan.price * 100) {
      return res.status(200).json({ status: "success" });
    }
    return res.status(200).json({ status: tx.status === "abandoned" ? "abandoned" : "failed" });
  } catch (e) {
    return res.status(500).json({ status: "failed", error: "Server error" });
  }
};
