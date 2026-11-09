const store = require("../lib/store");
const auth = require("../lib/auth");
const prices = require("../lib/prices");
const pay = require("../lib/paystack");
const intents = require("../lib/intents");

const PHONE = /^0[789][01]\d{8}$/;
const EMAIL = /^\S+@\S+\.\S+$/;

// Creates the order on the server, then starts the payment on Paystack from the server.
// The browser only ever receives a reference and an access code.
module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
  try {
    const b = req.body || {};

    const cfg = pay.configProblem();
    if (cfg) {
      console.error("CHECKOUT BLOCKED, payment settings problem:", cfg);
      return res.status(503).json({ error: "Payments are temporarily unavailable. Please try again later." });
    }

    // Logged-in users are recognised from their token. Guests may buy with a card, but not fund wallets.
    let user = null;
    if (req.headers.authorization) {
      const s = await auth.session(req);
      if (s) user = s.user;
    }

    const ip = String(req.headers["x-forwarded-for"] || "ip").split(",")[0].trim();
    if ((await store.incrWithExpiry("rl:checkout:ip:" + ip, 3600)) > 30) {
      return res.status(429).json({ error: "Too many payment attempts. Try again later." });
    }
    if (user && (await store.incrWithExpiry("rl:checkout:u:" + user.phone, 3600)) > 30) {
      return res.status(429).json({ error: "Too many payment attempts. Try again later." });
    }

    let email = String(b.email || "").trim();
    if (!EMAIL.test(email) || email.length > 120) email = user && user.email ? String(user.email) : "";
    if (!EMAIL.test(email)) return res.status(400).json({ error: "Enter a valid email address." });

    let intent;
    if (b.kind === "wallet") {
      if (!user) return res.status(401).json({ error: "Not logged in" });
      const amount = Number(b.amount);
      if (!Number.isInteger(amount) || amount < 100 || amount > 200000) {
        return res.status(400).json({ error: "Enter an amount from 100 to 200,000 naira." });
      }
      intent = { kind: "wallet", phone: user.phone, buyerPhone: user.phone, amountKobo: amount * 100 };
    } else if (b.kind === "order") {
      const plan = prices.findPlan(String(b.planId || ""));
      const phone = String(b.phone || "").trim();
      if (!plan) return res.status(400).json({ error: "Choose a valid amount." });
      if (!PHONE.test(phone)) return res.status(400).json({ error: "Enter a valid phone number." });
      // The price is the server's price. A price sent by the browser is never read.
      intent = {
        kind: "order", planId: plan.id, plan: plan.network + " " + plan.label, network: plan.network,
        phone: phone, buyerPhone: user ? user.phone : "", amountKobo: plan.price * 100
      };
    } else {
      return res.status(400).json({ error: "Unknown request" });
    }

    intent.reference = intents.newReference(intent.kind);
    intent.email = email;
    intent.currency = "NGN";
    intent.mode = pay.keyMode();
    intent.createdAt = new Date().toISOString();

    if (!(await intents.create(intent))) return res.status(500).json({ error: "Please try again." });

    const fields = intent.kind === "wallet"
      ? [{ display_name: "Account", variable_name: "wallet_phone", value: intent.phone }, { display_name: "Purpose", variable_name: "purpose", value: "wallet" }]
      : [{ display_name: "Phone", variable_name: "phone", value: intent.phone }, { display_name: "Plan", variable_name: "plan", value: intent.plan }];
    const init = await pay.initialize({
      email: email, amountKobo: intent.amountKobo, reference: intent.reference,
      metadata: { order: intent.reference, kind: intent.kind, custom_fields: fields }
    });
    if (!init.ok) {
      await intents.remove(intent.reference);
      if (init.config) return res.status(503).json({ error: init.message });
      return res.status(502).json({ error: "Could not start the payment. Please try again." });
    }

    return res.status(200).json({
      reference: intent.reference, accessCode: init.accessCode, kind: intent.kind,
      amount: intent.amountKobo / 100, plan: intent.plan || "", phone: intent.kind === "order" ? intent.phone : ""
    });
  } catch (e) {
    return res.status(500).json({ error: "Server error" });
  }
};
