import { runCheck } from "./lib/checker.mts";

// Hit this in a browser any time to run a check on demand:
//   https://<your-site>.netlify.app/.netlify/functions/manual-check
// Add ?dryRun=1 to see what it would find without sending a
// notification or updating the stored baseline (safe to run repeatedly
// while testing).
export default async (req: Request) => {
  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1";

  try {
    const result = await runCheck({ dryRun });
    return new Response(JSON.stringify(result, null, 2), {
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }, null, 2), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};
