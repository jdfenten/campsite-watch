import type { Config } from "@netlify/functions";
import { runCheck } from "./lib/checker.mts";

// Scheduled functions don't return response bodies to anything — all the
// useful output goes to console.log/console.error, visible in the
// Netlify function logs.
export default async (req: Request) => {
  const { next_run } = await req.json();
  try {
    const result = await runCheck();
    console.log(
      `check-availability done: ${result.checked} open night(s), ${result.new} new. Next run: ${next_run}`
    );
  } catch (err) {
    console.error("check-availability failed:", err);
  }
};

export const config: Config = {
  // Every 10 minutes. Netlify's scheduled functions run in UTC.
  schedule: "*/10 * * * *",
};
