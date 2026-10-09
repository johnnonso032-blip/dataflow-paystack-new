(function () {
  var NETWORKS = {
    MTN: [
      { id: "mtn-1gb", label: "1GB", price: 300 },
      { id: "mtn-2gb", label: "2GB", price: 600 },
      { id: "mtn-5gb", label: "5GB", price: 1500 }
    ],
    Airtel: [
      { id: "airtel-1gb", label: "1GB", price: 300 },
      { id: "airtel-2gb", label: "2GB", price: 600 },
      { id: "airtel-5gb", label: "5GB", price: 1500 }
    ],
    Glo: [
      { id: "glo-1gb", label: "1GB", price: 250 },
      { id: "glo-2gb", label: "2GB", price: 500 },
      { id: "glo-5gb", label: "5GB", price: 1250 }
    ]
  };

  function findPlan(id) {
    for (var net in NETWORKS) {
      var list = NETWORKS[net];
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === id) {
          return { id: list[i].id, label: list[i].label, price: list[i].price, network: net };
        }
      }
    }
    return null;
  }

  var PRICES = { NETWORKS: NETWORKS, findPlan: findPlan };
  if (typeof window !== "undefined") window.DATAFLOW_PRICES = PRICES;
  if (typeof module !== "undefined") module.exports = PRICES;
})();
