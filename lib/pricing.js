const store = require("./store");

const DEFAULTS = { airtimePct: 1, dataPct: 1, commissionPct: 3 };

async function settings() {
  const s = await store.get("settings:pricing");
  return Object.assign({}, DEFAULTS, s || {});
}

// The server decides the price. The phone never sends a price.
function priceFor(plan, isReseller, s) {
  if (!isReseller) return plan.price;
  const pct = plan.vt && plan.vt.airtime ? s.airtimePct : s.dataPct;
  return Math.max(1, Math.round(plan.price * (100 - pct) / 100));
}

module.exports = { DEFAULTS: DEFAULTS, settings: settings, priceFor: priceFor };
