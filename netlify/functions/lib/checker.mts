import { getStore } from "@netlify/blobs";
import * as cheerio from "cheerio";
import { findPark } from "./parks.mts";

declare const Netlify: { env: { get(key: string): string | undefined } };

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function baseUrlFor(parkSlug: string): string {
  return `https://reserve.southcarolinaparks.com/${parkSlug}/camping/`;
}

// The exact hidden-field payload the site's own form submits for a
// "parkwide calendar" view request, captured from a live browser session
// on 2026-09-04 against reserve.southcarolinaparks.com/devils-fork/camping/.
// csrfToken, parkid and pwFromDate are overridden per request; everything
// else mirrors the site's own defaults so the server accepts the POST.
function buildFormBody(csrfToken: string, parkId: string, pwFromDate: string) {
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
    parkid: parkId,
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

// Best-effort "type" for a site name like "Tent Campsite T-14" -> "Tent
// Campsite", or "RV Site 42" -> "RV Site". Strips a trailing site
// identifier (letters/digits/hyphens) off the end of the name.
export function siteType(site: string): string {
  const stripped = site.replace(/\s+[A-Za-z]{0,3}-?\d+[A-Za-z0-9-]*$/, "").trim();
  return stripped || site;
}

async function fetchWindow(
  baseUrl: string,
  parkId: string,
  pwFromDate: string,
  cookie: string,
  csrfToken: string
): Promise<Slot[]> {
  const res = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": UA,
      cookie,
      referer: baseUrl,
    },
    body: buildFormBody(csrfToken, parkId, pwFromDate),
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

function toIso(dateMMDDYYYY: string): string {
  const [mm, dd, yyyy] = dateMMDDYYYY.split("/");
  return `${yyyy}-${mm}-${dd}`;
}

// Most SC state park sites have a 2-night minimum stay, so a single isolated
// open night isn't actually bookable. Keep only slots where the site also
// has the following (minNights - 1) night(s) open too — i.e. dates that
// could actually start a `minNights`-night stay.
const MIN_STAY_NIGHTS = 2;

function filterMinStay(slots: Slot[], minNights: number): Slot[] {
  const bySite = new Map<string, Set<string>>();
  for (const s of slots) {
    if (!bySite.has(s.site)) bySite.set(s.site, new Set());
    bySite.get(s.site)!.add(toIso(s.date));
  }
  return slots.filter((s) => {
    const dates = bySite.get(s.site)!;
    const start = new Date(toIso(s.date) + "T00:00:00Z");
    for (let i = 0; i < minNights; i++) {
      const iso = new Date(start.getTime() + i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      if (!dates.has(iso)) return false;
    }
    return true;
  });
}

// Joe only wants the sites right on Lake Jocassee at Devils Fork for now
// (per the campground map: 34, 35, 37, 39, 40, 41). Other parks aren't
// restricted — this list only applies when it has an entry for the park.
const WATERFRONT_SITES: Record<string, Set<string>> = {
  "devils-fork": new Set(
    ["34", "35", "37", "39", "40", "41"].map((n) => `Campsite ${n}`)
  ),
};

// Fetches every open night for `parkSlug` between startISO and endISO
// (inclusive) that's actually usable: filtered to a park's site whitelist
// (if one is configured) and to dates that can start a MIN_STAY_NIGHTS-night
// stay. Used both by the watch/notify flow and by the on-demand availability
// search.
export async function fetchAvailability(
  parkSlug: string,
  parkId: string,
  startISO: string,
  endISO: string
): Promise<Slot[]> {
  const baseUrl = baseUrlFor(parkSlug);

  const homeRes = await fetch(baseUrl, { headers: { "user-agent": UA } });
  const homeHtml = await homeRes.text();
  const csrfToken = extractCsrfToken(homeHtml);
  if (!csrfToken) {
    throw new Error("Could not find csrfToken on page — site markup may have changed.");
  }
  const setCookie = homeRes.headers.getSetCookie ? homeRes.headers.getSetCookie() : [];
  const cookie = extractSessionCookie(setCookie);

  const windows = buildWindows(startISO, endISO);
  const windowResults = await Promise.allSettled(
    windows.map((w) => fetchWindow(baseUrl, parkId, w, cookie, csrfToken))
  );
  const allSlots: Slot[] = [];
  windowResults.forEach((result, i) => {
    if (result.status === "fulfilled") {
      allSlots.push(...result.value.filter((s) => withinRange(s.date, startISO, endISO)));
    } else {
      console.error(`Window ${windows[i]} failed:`, result.reason);
    }
  });

  const siteFilter = WATERFRONT_SITES[parkSlug];
  const filtered = siteFilter ? allSlots.filter((s) => siteFilter.has(s.site)) : allSlots;

  return filterMinStay(filtered, MIN_STAY_NIGHTS);
}

// Formats slots the way Joe wants to read them: one line per date, e.g.
// "10/14/2026: Tent Campsite T-3 ($23), RV Site 12 ($31)".
export function formatSlotLines(slots: Slot[]): string[] {
  const byDate = new Map<string, string[]>();
  for (const s of slots) {
    const list = byDate.get(s.date) || [];
    list.push(s.price ? `${s.site} ($${s.price})` : s.site);
    byDate.set(s.date, list);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => {
      const [am, ad, ay] = a.split("/").map(Number);
      const [bm, bd, by] = b.split("/").map(Number);
      return ay - by || am - bm || ad - bd;
    })
    .map(([date, sites]) => `${date}: ${sites.join(", ")}`);
}

const NTFY_URL_BASE = "https://ntfy.sh";

async function sendNtfy(topic: string, title: string, body: string, priority = "urgent") {
  await fetch(`${NTFY_URL_BASE}/${topic}`, {
    method: "POST",
    headers: {
      title,
      priority,
      tags: "tent,bell",
    },
    body,
  });
}

async function logNotification(entry: {
  watchId: string;
  parkSlug: string;
  parkName: string;
  rangeStart: string;
  rangeEnd: string;
  newCount: number;
  lines: string[];
}) {
  try {
    const store = getStore("campsite-watch-notifications");
    const key = `${Date.now()}-${entry.watchId}`;
    await store.setJSON(key, { ...entry, sentAt: new Date().toISOString() });
  } catch (err) {
    console.error("Failed to log notification:", err);
  }
}

export type Watch = {
  id: string;
  parkSlug: string;
  parkName: string;
  rangeStart: string; // YYYY-MM-DD
  rangeEnd: string; // YYYY-MM-DD, inclusive
  ntfyTopic: string;
  createdAt: string;
};

export type WatchCheckResult = {
  watchId: string;
  checked: number;
  new: number;
  newSlots: Slot[];
};

// Checks one watch's park/date-range against its last-known state (keyed
// by park+range so re-creating the same watch doesn't re-fire), notifies
// on genuinely new openings, and logs what was sent.
export async function runWatchCheck(
  watch: Watch,
  opts: { dryRun?: boolean } = {}
): Promise<WatchCheckResult> {
  const park = findPark(watch.parkSlug);
  const parkId = park?.parkId;
  if (!parkId) {
    throw new Error(`Unknown park slug: ${watch.parkSlug}`);
  }

  const store = getStore("campsite-watch");
  const stateKey = `${watch.parkSlug}:${watch.rangeStart}:${watch.rangeEnd}`;

  const allSlots = await fetchAvailability(watch.parkSlug, parkId, watch.rangeStart, watch.rangeEnd);

  const currentKeys = new Set(allSlots.map((s) => `${s.site}|${s.date}`));
  const previous = (await store.get(stateKey, { type: "json" })) as string[] | null;
  const previousKeys = new Set(previous || []);

  const newSlots = allSlots.filter((s) => !previousKeys.has(`${s.site}|${s.date}`));

  console.log(
    `[${watch.parkSlug}] checked ${allSlots.length} open night(s), ${newSlots.length} new since last run.`
  );

  if (newSlots.length > 0 && !opts.dryRun) {
    const lines = formatSlotLines(newSlots);
    const title = `${watch.parkName}: ${newSlots.length} new opening${newSlots.length === 1 ? "" : "s"}`;
    await sendNtfy(watch.ntfyTopic, title, lines.join("\n"));
    await logNotification({
      watchId: watch.id,
      parkSlug: watch.parkSlug,
      parkName: watch.parkName,
      rangeStart: watch.rangeStart,
      rangeEnd: watch.rangeEnd,
      newCount: newSlots.length,
      lines,
    });
  }

  if (!opts.dryRun) {
    await store.setJSON(stateKey, [...currentKeys]);
  }

  return { watchId: watch.id, checked: allSlots.length, new: newSlots.length, newSlots };
}

export async function sendTestNotification(topic: string) {
  await sendNtfy(
    topic,
    "Campsite Watch - test",
    "If you got this, your campsite-watch notifications are wired up correctly.",
    "default"
  );
}
