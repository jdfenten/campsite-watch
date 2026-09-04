import { findPark } from "./lib/parks.mts";
import { fetchAvailability, formatSlotLines, siteType } from "./lib/checker.mts";

const JSON_HEADERS = { "content-type": "application/json", "access-control-allow-origin": "*" };

// GET /.netlify/functions/api-availability?parkSlug=devils-fork&start=2026-10-01&end=2026-10-31&type=Tent
//
// Live on-demand availability search — does NOT touch watch/notification
// state. `type` is an optional case-insensitive substring filter matched
// against the derived site type (e.g. "tent", "rv", "cabin").
export default async (req: Request) => {
  const url = new URL(req.url);
  const parkSlug = url.searchParams.get("parkSlug") || "";
  const start = url.searchParams.get("start") || "";
  const end = url.searchParams.get("end") || "";
  const typeFilter = (url.searchParams.get("type") || "").trim().toLowerCase();

  const park = findPark(parkSlug);
  if (!park) {
    return new Response(JSON.stringify({ error: `Unknown park slug: ${parkSlug}` }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return new Response(JSON.stringify({ error: "start/end must be YYYY-MM-DD" }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  try {
    let slots = await fetchAvailability(parkSlug, park.parkId, start, end);
    if (typeFilter) {
      slots = slots.filter((s) => siteType(s.site).toLowerCase().includes(typeFilter));
    }
    const lines = formatSlotLines(slots);
    return new Response(
      JSON.stringify({ park: park.name, parkSlug, start, end, count: slots.length, slots, lines }, null, 2),
      { headers: JSON_HEADERS }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: JSON_HEADERS });
  }
};
