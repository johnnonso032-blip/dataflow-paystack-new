const { findPlan } = require("../lib/prices");

module.exports = async (req, res) => {
  const reference = req.query.reference;
  const plan = findPlan(req.query.planId);

  if (!reference || !plan) {
    return res.status(400).json({ status: "error", message: "Missing reference or plan" });
  }
  if (!process.env.PAYSTACK_SECRET_KEY) {
    return res.status(500).json({ status: "error", message: "Secret key not set" });
  }

  try {
    const r = await fetch(
      "https://api.paystack.co/transaction/verify/" + encodeURIComponent(reference),
      { headers: { Authorization: "Bearer " + process.env.PAYSTACK_SECRET_KEY } }
    );
    const data = await r.json();

    if (!data.status || !data.data) {
      return res.status(200).json({
        status: "failed",
        message: data.message || "Transaction reference not found"
      });
    }

    const tx = data.data;
    if (tx.status === "success") {
      if (tx.amount !== plan.price * 100) {
        return res.status(200).json({ status: "failed", message: "Amount does not match plan price" });
      }
      return res.status(200).json({ status: "success" });
    }
    if (tx.status === "abandoned") {
      return res.status(200).json({ status: "abandoned" });
    }
    if (tx.status === "pending" || tx.status === "ongoing" || tx.status === "processing") {
      return res.status(200).json({ status: "pending" });
    }
    return res.status(200).json({ status: "failed", message: tx.gateway_response || "Payment failed" });
  } catch (e) {
    return res.status(500).json({ status: "error", message: "Server error" });
  }
};
