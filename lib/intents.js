const crypto = require("crypto");
const store = require("./store");
const pay = require("./paystack");

// An unpaid order that is never completed disappears after this long.
const KEEP_SECONDS = 60 * 24 * 3600;

// The server makes the reference. The browser never chooses it.
function newReference(kind) {
  return (kind === "wallet" ? "WAL-" : "DFNG-") + Date.now() + "-" + crypto.randomBytes(8).toString("hex");
}

function key(ref) {
  return pay.ns() + "intent:" + ref;
}

// Saves what the customer is buying BEFORE they pay. It is never changed afterwards.
async function create(intent) {
  const r = await store.cmd(["SET", key(intent.reference), JSON.stringify(intent), "NX", "EX", String(KEEP_SECONDS)]);
  return r === "OK";
}

async function get(ref) {
  if (!pay.validRef(ref)) return null;
  return store.get(key(ref));
}

async function remove(ref) {
  await store.del(key(ref));
}

module.exports = { newReference: newReference, create: create, get: get, remove: remove };
