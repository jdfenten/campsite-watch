import { getStore } from "@netlify/blobs";

const JSON_HEADERS = { "content-type": "application/json", "access-control-allow-origin": "*" };

// GET /.netlify/functions/api-notifications — the last 50 notifications
// actually sent, newest first. This is the checks-and-balance log: what
// went out, to which watch, and what it said.
export default async () => {
  const store = getStore("campsite-watch-notifications");
  const { blobs } = await store.list();
  const sorted = blobs.map((b) => b.key).sort().reverse().slice(0, 50);
  const entries = await Promise.all(sorted.map((key) => store.get(key, { type: "json" })));
  return new Response(JSON.stringify(entries.filter(Boolean)), { headers: JSON_HEADERS });
};
