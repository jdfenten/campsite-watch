import { runWatchCheck } from "./lib/checker.mts";
import { listWatches, getWatch } from "./lib/watches.mts";

// Hit this in a browser any time to run a check on demand:
//   https://<your-site>.netlify.app/.netlify/functions/manual-check
// Add ?dryRun=1 to see what it would find without sending a notification
// or updating the stored baseline (safe to run repeatedly while testing).
// Add ?watchId=<id> to check just one watch instead of all of them.
export default async (req: Request) => {
  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const watchId = url.searchParams.get("watchId");

  try {
    const watches = watchId ? [await getWatch(watchId)].filter(Boolean) : await listWatches();
    if (watchId && watches.length === 0) {
      return new Response(JSON.stringify({ error: `No watch with id ${watchId}` }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    const results = await Promise.all(watches.map((w) => runWatchCheck(w as any, { dryRun })));
    return new Response(JSON.stringify(results, null, 2), {
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }, null, 2), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};
