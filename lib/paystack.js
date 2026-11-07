const crypto = require("crypto");

const REF = /^[A-Za-z0-9._=-]{3,100}$/;

function secret() {
  return String(process.env.PAYSTACK_SECRET_KEY || "").trim();
}

// "test" or "live", read from the secret key itself.
// Returns null if the key is missing or is not a Paystack secret key.
function keyMode() {
  const k = secret();
  if (/^sk_test_[A-Za-z0-9]+$/.test(k)) return "test";
  if (/^sk_live_[A-Za-z0-9]+$/.test(k)) return "live";
  return null;
}

// VTpass is in test mode only when its address is the sandbox address.
function supplierMode() {
  const base = String(process.env.VTPASS_BASE_URL || "https://sandbox.vtpass.com/api");
  return /sandbox/i.test(base) ? "test" : "live";
}

// Returns a reason string when payments must NOT be processed, or null when it is safe.
// Test money must never meet live delivery, and live money must never meet fake delivery.
function configProblem() {
  const m = keyMode();
  if (!m) return "PAYSTACK_SECRET_KEY is missing or is not a Paystack secret key";
  const declared = String(process.env.PAYSTACK_MODE || "").trim().toLowerCase();
  if (declared && declared !== m) {
    return "PAYSTACK_MODE (" + declared + ") does not match the Paystack secret key (" + m + ")";
  }
  if (m !== supplierMode()) {
    return "Paystack is in " + m + " mode but VTpass is in " + supplierMode() + " mode";
  }
  return null;
}

function validRef(ref) {
  return REF.test(String(ref || ""));
}

// Asks Paystack about a transaction and checks it is really the one we asked for.
async function verify(reference) {
  const problem = configProblem();
  if (problem) {
    console.error("PAYMENT CONFIG PROBLEM:", problem);
    return { ok: false, config: true, message: "Payments are temporarily unavailable. Please try again later." };
  }
  if (!validRef(reference)) return { ok: false, message: "Bad reference" };
  const r = await fetch(
    "https://api.paystack.co/transaction/verify/" + encodeURIComponent(reference),
    { headers: { Authorization: "Bearer " + secret() } }
  );
  const data = await r.json();
  if (!data || !data.status || !data.data) {
    return { ok: false, notFound: true, message: (data && data.message) || "Transaction reference not found" };
  }
  const tx = data.data;
  if (String(tx.reference) !== String(reference)) return { ok: false, message: "Reference mismatch" };
  if (tx.domain && tx.domain !== keyMode()) return { ok: false, message: "Payment mode mismatch" };
  return { ok: true, tx: tx };
}

// Money checks for a successful payment. Returns a reason string, or null when fine.
function badMoney(tx) {
  if (tx.currency !== "NGN") return "Unsupported currency";
  if (!Number.isInteger(tx.amount) || tx.amount <= 0) return "Invalid amount";
  return null;
}

// Reads the request body exactly as Paystack sent it (needed to check the signature).
async function rawBody(req) {
  if (typeof req.on === "function" && req.readable === true && req.readableEnded !== true) {
    const chunks = [];
    for await (const c of req) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
    return Buffer.concat(chunks);
  }
  const b = req.body;
  if (Buffer.isBuffer(b)) return b;
  if (typeof b === "string") return Buffer.from(b);
  if (b && typeof b === "object") return Buffer.from(JSON.stringify(b));
  return Buffer.alloc(0);
}

// Paystack signs the raw body with your secret key (HMAC SHA-512).
function validSignature(raw, signature) {
  const k = secret();
  if (!k || !signature) return false;
  const expected = crypto.createHmac("sha512", k).update(raw).digest();
  const given = Buffer.from(String(signature).trim().toLowerCase(), "hex");
  return given.length === expected.length && crypto.timingSafeEqual(expected, given);
}

module.exports = {
  keyMode: keyMode, supplierMode: supplierMode, configProblem: configProblem,
  validRef: validRef, verify: verify, badMoney: badMoney,
  rawBody: rawBody, validSignature: validSignature
};
