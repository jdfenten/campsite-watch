import type { Config } from "@netlify/functions";
import { runWatchCheck } from "./lib/checker.mts";
import { listWatches } from "./lib/watches.mts";

// Scheduled functions don't return response bodies to anything — all the
// useful output goes to console.log/console.error, visible in the
// Netlify function logs.
export default async (req: Request) => {
  const { next_run } = await req.json();
  try {
    const watches = await listWatches();
    const results = await Promise.allSettled(watches.map((w) => runWatchCheck(w)));
    let totalNew = 0;
    results.forEach((r, i) => {
      if (r.status === "fulfilled") {
        totalNew += r.value.new;
      } else {
        console.error(`Watch ${watches[i]?.id} failed:`, r.reason);
      }
    });
    console.log(
      `check-availability done: ${watches.length} watch(es), ${totalNew} new opening(s) total. Next run: ${next_run}`
    );
  } catch (err) {
    console.error("check-availability failed:", err);
  }
};

export const config: Config = {
  // Every 10 minutes. Netlify's scheduled functions run in UTC.
  schedule: "*/10 * * * *",
};
