(function () {
  var CONFIG = {
    PAYSTACK_PUBLIC_KEY: "pk_test_ed2c94d058407ae260d4c380e1563d9fc69572c9",
    CURRENCY: "NGN",
    ADMIN_PASSCODE: "standard0147"
  };
  if (typeof window !== "undefined") window.DATAFLOW_CONFIG = CONFIG;
  if (typeof module !== "undefined") module.exports = CONFIG;
})();
