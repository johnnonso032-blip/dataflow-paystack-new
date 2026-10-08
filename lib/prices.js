const PLANS = {
  mtn_1gb: { name: "MTN 1GB", price: 300 },
  mtn_2gb: { name: "MTN 2GB", price: 600 },
  mtn_5gb: { name: "MTN 5GB", price: 1500 }
};
if (typeof module !== "undefined") module.exports = { PLANS };
if (typeof window !== "undefined") window.PLANS = PLANS;
