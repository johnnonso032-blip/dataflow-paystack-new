const DB_URL = process.env.KV_REST_API_URL;
const DB_TOKEN = process.env.KV_REST_API_TOKEN;

async function cmd(args) {
  if (!DB_URL || !DB_TOKEN) throw new Error("Database keys not set");
  const r = await fetch(DB_URL, {
    method: "POST",
    headers: { Authorization: "Bearer " + DB_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(args)
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error);
  return d.result;
}

module.exports = {
  get: async function (key) {
    const v = await cmd(["GET", key]);
    return v ? JSON.parse(v) : null;
  },
  set: function (key, obj) {
    return cmd(["SET", key, JSON.stringify(obj)]);
  },
  lock: async function (key, seconds) {
    return (await cmd(["SET", key, "1", "NX", "EX", String(seconds)])) === "OK";
  },
  unlock: function (key) {
    return cmd(["DEL", key]);
  },
  addToList: function (listKey, score, member) {
    return cmd(["ZADD", listKey, String(score), member]);
  },
  latest: function (listKey, count) {
    return cmd(["ZRANGE", listKey, "0", String(count - 1), "REV"]);
  }
};
