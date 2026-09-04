import { getStore } from "@netlify/blobs";
import * as cheerio from "cheerio";

declare const Netlify: { env: { get(key: string): string | undefined } };

// ---- Config (env vars, with sane defaults for Devils Fork / October 2026) ----
const PARK_SLUG = Netlify.env.get("PARK_SLUG") || "devils-fork";
const PARK_ID = Netlify.env.get("PARK_ID") || "12";
const RANGE_START = Netlify.env.get("RANGE_START") || "2026-10-01"; // YYYY-MM-DD
const RANGE_END = Netlify.env.get("RANGE_END") || "2026-10-31"; // YYYY-MM-DD, inclusive
const NTFY_TOPIC = Netlify.env.get("NTFY_TOPIC"); // e.g. "joe-devils-fork-abc123"
const NTFY_URL = Netlify.env.get("NTFY_URL") || (NTFY_TOPIC ? `https://ntfy.sh/${NTFY_TOPIC}` : undefined);

const BASE_URL = `https://reserve.southcarolinaparks.com/${PARK_SLUG}/camping/`;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// The exact hidden-field payload the site's own form submits for a
// "parkwide calendar" view request, captured from a live browser session
// on 2026-09-04 against reserve.southcarolinaparks.com/devils-fork/camping/.
// csrfToken and pwFromDate are overridden per request; everything else
// mirrors the site's own defaults so the server accepts the POST.
function buildFormBody(csrfToken: string, pwFromDate: string) {
  return new URLSearchParams({
    token: "",
    csrfToken,
    stage: "2",
    view: "parkwide",
    processing: "false",
    startOver: "false",
    reserve: "false",
    anotherReservation: "false",
    depositPayment: "true",
    adaSite: "false",
    checkin: "10/01/2026",
    checkout: "10/03/2026",
    selectedDates: "",
    selection: "",
    joinList: "false",
    coupon: "",
    addCoupon: "false",
    discounts: "",
    addDiscount: "false",
    donation: "0",
    roundDonation: "false",
    addDonation: "false",
    removeDonation: "false",
    golfCartFeesHidden: "",
    srResDiscKey: "",
    srResDiscZip: "",
    reEnableFields: "",
    maxrv: "10",
    subEquestrian: "false",
    subHammock: "false",
    subRVTent: "false",
    subTent: "false",
    electric: "",
    atlas_selection: "",
    parkid: PARK_ID,
    pwFromDate,
    parkwideFilters: "",
  });
}

function extractCsrfToken(html: string): string | null {
  const m = html.match(/name=["']csrfToken["'][^>]*\svalue=["']([^"']+)["']/i);
return m ? m[1] : null;
}

function extractSessionCookie(setCookieHeaders: string[]): string {
  return setCookieHeaders.map((c) => c.split(";")[0]).join("; ");
}

// Windows of `pwFromDate` values (14-day grid) that together cover
// [startISO, endISO].
function buildWindows(startISO: string, endISO: string): string[] {
  const windows: string[] = [];
  let cur = new Date(startISO + "T00:00:00Z");
  const end = new Date(endISO + "T00:00:00Z");
  while (cur <= end) {
    windows.push(cur.toISOString().slice(0, 10));
    cur = new Date(cur.getTime() + 14 * 24 * 60 * 60 * 1000);
  }
  return windows;
}

export type Slot = { site: string; date: string; price: string };

async function fetchWindow(pwFromDate: string, cookie: string, csrfToken: string): Promise<Slot[]> {
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": UA,
      cookie,
      referer: BASE_URL,
    },
    body: buildFormBody(csrfToken, pwFromDate),
  });

  if (!res.ok) {
    throw new Error(`POST ${pwFromDate} failed: ${res.status}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);
  const slots: Slot[] = [];

  $("#parkwideTable tbody tr").each((_, row) => {
    const site = $(row).attr("data-description")?.trim();
    if (!site) return;
    $(row)
      .find("td.avail")
      .each((__, cell) => {
        const date = $(cell).attr("data-atlasdate"); // MM/DD/YYYY
        const price = $(cell).attr("data-atlasprice") || "";
        if (date) slots.push({ site, date, price });
      });
  });

  return slots;
}

function withinRange(dateMMDDYYYY: string, startISO: string, endISO: string): boolean {
  const [mm, dd, yyyy] = dateMMDDYYYY.split("/");
  const iso = `${yyyy}-${mm}-${dd}`;
  return iso >= startISO && iso <= endISO;
}

async function notify(newSlots: Slot[]) {
  if (!NTFY_URL) {
    console.warn("NTFY_URL/NTFY_TOPIC not set — skipping notification. New slots:", newSlots);
    return;
  }
  const byDate = new Map<string, string[]>();
  for (const s of newSlots) {
    const list = byDate.get(s.date) || [];
    list.push(`${s.site} ($${s.price})`);
    byDate.set(s.date, list);
  }
  const lines = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, sites]) => `${date}: ${sites.join(", ")}`);

  const body = lines.join("\n");
  const title = `Devils Fork: ${newSlots.length} new opening${newSlots.length === 1 ? "" : "s"}`;

  await fetch(NTFY_URL, {
    method: "POST",
    headers: {
      title,
      priority: "urgent",
      tags: "tent,bell",
      click: BASE_URL,
    },
    body,
  });
}

export type CheckResult = {
  checked: number;
  new: number;
  newSlots: Slot[];
  windows: string[];
};

export async function runCheck(opts: { dryRun?: boolean } = {}): Promise<CheckResult> {
  const store = getStore("campsite-watch");
  const stateKey = `${PARK_SLUG}:${RANGE_START}:${RANGE_END}`;

  // 1. Establish a session + fresh CSRF token.
  const homeRes = await fetch(BASE_URL, { headers: { "user-agent": UA } });
  const homeHtml = await homeRes.text();
  const csrfToken = extractCsrfToken(homeHtml);
  if (!csrfToken) {
    throw new Error("Could not find csrfToken on page — site markup may have changed.");
  }
  const setCookie = homeRes.headers.getSetCookie ? homeRes.headers.getSetCookie() : [];
  const cookie = extractSessionCookie(setCookie);

  // 2. Pull every 2-week window covering the target range, in parallel —
  // scheduled functions have a 30-second execution limit, and these
  // requests are independent once we have a cookie + csrfToken.
  const windows = buildWindows(RANGE_START, RANGE_END);
  const windowResults = await Promise.allSettled(windows.map((w) => fetchWindow(w, cookie, csrfToken)));
  const allSlots: Slot[] = [];
  windowResults.forEach((result, i) => {
    if (result.status === "fulfilled") {
      allSlots.push(...result.value.filter((s) => withinRange(s.date, RANGE_START, RANGE_END)));
    } else {
      console.error(`Window ${windows[i]} failed:`, result.reason);
    }
  });

  // 3. Dedup + diff against last-known state.
  const currentKeys = new Set(allSlots.map((s) => `${s.site}|${s.date}`));
  const previous = (await store.get(stateKey, { type: "json" })) as string[] | null;
  const previousKeys = new Set(previous || []);

  const newSlots = allSlots.filter((s) => !previousKeys.has(`${s.site}|${s.date}`));

  console.log(
    `Checked ${windows.length} window(s), ${allSlots.length} available night(s) total, ${newSlots.length} new since last run.`
  );

  if (newSlots.length > 0 && !opts.dryRun) {
    await notify(newSlots);
  }

  // 4. Persist current state for next run (skip on dry run so testing
  // doesn't clobber the real baseline).
  if (!opts.dryRun) {
    await store.setJSON(stateKey, [...currentKeys]);
  }

  return { checked: allSlots.length, new: newSlots.length, newSlots, windows };
}
