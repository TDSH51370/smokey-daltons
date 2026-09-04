const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = "smokey:leaderboard";
const TOP = 10;

async function redis(args) {
  const r = await fetch(REDIS_URL, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + REDIS_TOKEN,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(args)
  });
  if (!r.ok) throw new Error("redis " + r.status);
  const j = await r.json();
  return j.result;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  if (!REDIS_URL || !REDIS_TOKEN) {
    return res.status(503).json({ error: "storage_not_configured" });
  }

  try {
    if (req.method === "POST") {
      let body = req.body;
      if (typeof body === "string") body = JSON.parse(body || "{}");
      if (!body) body = {};

      const name = String(body.name || "")
        .replace(/[<>&"'\\]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 14);
      const score = Math.floor(Number(body.score));

      if (!name) return res.status(400).json({ error: "name_required" });
      if (!isFinite(score) || score <= 0 || score > 200000) {
        return res.status(400).json({ error: "score_invalid" });
      }

      // GT : on ne garde que le meilleur score de chaque joueur
      await redis(["ZADD", KEY, "GT", "CH", String(score), name]);
    } else if (req.method !== "GET") {
      return res.status(405).json({ error: "method_not_allowed" });
    }

    const flat = await redis(["ZRANGE", KEY, "0", String(TOP - 1), "REV", "WITHSCORES"]);
    const scores = [];
    for (let i = 0; i < flat.length; i += 2) {
      scores.push({ n: flat[i], s: Number(flat[i + 1]) });
    }
    return res.status(200).json({ scores });
  } catch (e) {
    return res.status(500).json({ error: "server_error" });
  }
};
