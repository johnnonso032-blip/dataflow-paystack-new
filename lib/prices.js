(function () {
  function airtime(prefix, serviceID) {
    return [100, 200, 500, 1000].map(function (n) {
      return { id: prefix + "-a-" + n, label: "Airtime", price: n,
               vt: { serviceID: serviceID, airtime: true } };
    });
  }
  function data(id, label, price, serviceID, code) {
    return { id: id, label: label, price: price,
             vt: { serviceID: serviceID, code: code } };
  }

  var NETWORKS = {
    "MTN Data": [
      data("mtn-d-100", "100MB - 1 day", 100, "mtn-data", "mtn-10mb-100"),
      data("mtn-d-200", "200MB - 2 days", 200, "mtn-data", "mtn-50mb-200"),
      data("mtn-d-600", "2.5GB - 2 days", 600, "mtn-data", "mtn-2-5gb-600"),
      data("mtn-d-1000", "1.5GB - 30 days", 1000, "mtn-data", "mtn-100mb-1000"),
      data("mtn-d-1500", "3GB - 30 days", 1500, "mtn-data", "mtn-3gb-1500"),
      data("mtn-d-2000", "4.5GB - 30 days", 2000, "mtn-data", "mtn-500mb-2000")
    ],
    "Airtel Data": [
      data("airtel-d-100", "75MB - 1 day", 100, "airtel-data", "airt-100"),
      data("airtel-d-300", "350MB - 7 days", 300, "airtel-data", "airt-300"),
      data("airtel-d-500", "750MB - 14 days", 500, "airtel-data", "airt-500"),
      data("airtel-d-1000", "1.5GB - 30 days", 1000, "airtel-data", "airt-1000"),
      data("airtel-d-1500", "3GB - 30 days", 1500, "airtel-data", "airt-1500"),
      data("airtel-d-2000", "4.5GB - 30 days", 2000, "airtel-data", "airt-2000")
    ],
    "MTN Airtime": airtime("mtn", "mtn"),
    "Airtel Airtime": airtime("airtel", "airtel")
  };

  function findPlan(id) {
    for (var net in NETWORKS) {
      var list = NETWORKS[net];
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === id) {
          return { id: list[i].id, label: list[i].label, price: list[i].price,
                   vt: list[i].vt, network: net };
        }
      }
    }
    return null;
  }

  var PRICES = { NETWORKS: NETWORKS, findPlan: findPlan };
  if (typeof window !== "undefined") window.DATAFLOW_PRICES = PRICES;
  if (typeof module !== "undefined") module.exports = PRICES;

  // Browser only: retry the payment check when it is pending or errors.
  if (typeof window !== "undefined" && window.fetch) {
    var realFetch = window.fetch;
    window.fetch = function (url) {
      var u = typeof url === "string" ? url : (url && url.url) || "";
      if (u.indexOf("/api/verify") !== 0) return realFetch.apply(window, arguments);
      var args = arguments, tries = 0;
      function wait() {
        tries++;
        return new Promise(function (ok) { setTimeout(ok, 3000); });
      }
      function go() {
        return realFetch.apply(window, args).then(function (resp) {
          if (resp.status >= 500 && tries < 6) return wait().then(go);
          return resp.clone().json().then(function (d) {
            if (d && (d.status === "pending" || d.status === "error") && tries < 6) {
              return wait().then(go);
            }
            return resp;
          }, function () { return resp; });
        }, function (err) {
          if (tries < 6) return wait().then(go);
          throw err;
        });
      }
      return go();
    };

    // While the orders page is open and an order is pending, refresh it.
    setInterval(function () {
      try {
        if (location.hash !== "#orders" && location.hash !== "#admin") return;
        var list = JSON.parse(localStorage.getItem("dataflow_orders_v1") || "[]");
        var waiting = list.some(function (o) { return o.status === "pending"; });
        if (waiting) window.dispatchEvent(new Event("hashchange"));
      } catch (e) {}
    }, 3000);
  }
})();
