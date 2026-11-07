const { fulfil } = require("../lib/fulfil");
const wallet = require("../lib/wallet");
const store = require("../lib/store");
const pay = require("../lib/paystack");

function getField(tx, name) {
  const fields = (tx.metadata && tx.metadata.custom_fields) || [];
  const f = fields.find(function (x) { return x.variable_name === name; });
  return f ? String(f.value).trim() : "";
}

async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ received: false });
  try {
    if (pay.configProblem()) {
      console.error("WEBHOOK NOT PROCESSED, payment settings problem:", pay.configProblem());
      return res.status(503).json({ received: false });
    }

    // 1. Only Paystack can sign with our secret key. Anything unsigned or altered stops here,
    //    before anything is read from or written to the database.
    const raw = await pay.rawBody(req);
    if (raw.length === 0 || raw.length > 100000) return res.status(400).json({ received: false });
    if (!pay.validSignature(raw, req.headers["x-paystack-signature"])) {
      console.error("WEBHOOK REJECTED: signature missing or wrong");
      return res.status(401).json({ received: false });
    }

    let body;
    try { body = JSON.parse(raw.toString("utf8")); } catch (e) { return res.status(400).json({ received: false }); }

    // 2. Only successful charges matter. Everything else is acknowledged and ignored.
    const ref = body && body.data && body.data.reference;
    if (!body || body.event !== "charge.success" || !pay.validRef(ref)) {
      return res.status(200).json({ received: true, ignored: true });
    }

    // 3. Never act on the webhook text itself. Ask Paystack, then act on its answer.
    const v = await pay.verify(ref);
    if (!v.ok) {
      if (v.config) return res.status(503).json({ received: false });
      console.error("WEBHOOK for a payment Paystack could not confirm:", ref, v.message);
      return res.status(200).json({ received: true, ignored: true });
    }

    await store.setNx("hook:" + ref, { at: new Date().toISOString() });

    // 4. Repeats are safe: wallet credit is once per payment, and delivery is once per payment.
    if (getField(v.tx, "purpose") === "wallet") {
      await wallet.fundFromPaystack(ref);
    } else {
      await fulfil(ref);
    }
    return res.status(200).json({ received: true });
  } catch (e) {
    return res.status(500).json({ received: false });
  }
}

module.exports = handler;
module.exports.config = { api: { bodyParser: false } };
