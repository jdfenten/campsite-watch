import { findPark } from "./lib/parks.mts";
import { sendTestNotification, type Watch } from "./lib/checker.mts";
import { listWatches, saveWatch, deleteWatch, randomTopicSuffix } from "./lib/watches.mts";

const JSON_HEADERS = { "content-type": "application/json", "access-control-allow-origin": "*" };

function badRequest(message: string) {
  return new Response(JSON.stringify({ error: message }), { status: 400, headers: JSON_HEADERS });
}

// GET  /.netlify/functions/api-watches            -> list all watches
// POST /.netlify/functions/api-watches             -> create a watch
//      body: { parkSlug, rangeStart, rangeEnd, ntfyTopic? }
// DELETE /.netlify/functions/api-watches?id=<id>   -> remove a watch
export default async (req: Request) => {
  if (req.method === "GET") {
    const watches = await listWatches();
    return new Response(JSON.stringify(watches), { headers: JSON_HEADERS });
  }

  if (req.method === "POST") {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return badRequest("Invalid JSON body");
    }
    const { parkSlug, rangeStart, rangeEnd } = body || {};
    if (!parkSlug || !rangeStart || !rangeEnd) {
      return badRequest("parkSlug, rangeStart and rangeEnd are required");
    }
    const park = findPark(parkSlug);
    if (!park) {
      return badRequest(`Unknown park slug: ${parkSlug}`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rangeStart) || !/^\d{4}-\d{2}-\d{2}$/.test(rangeEnd)) {
      return badRequest("rangeStart/rangeEnd must be YYYY-MM-DD");
    }
    if (rangeStart > rangeEnd) {
      return badRequest("rangeStart must be on or before rangeEnd");
    }

    const ntfyTopic: string = body.ntfyTopic || `joe-${parkSlug}-${randomTopicSuffix()}`;
    const watch: Watch = {
      id: `${Date.now()}-${randomTopicSuffix()}`,
      parkSlug,
      parkName: park.name,
      rangeStart,
      rangeEnd,
      ntfyTopic,
      createdAt: new Date().toISOString(),
    };
    await saveWatch(watch);

    // Best-effort: let the user know the topic is live immediately.
    sendTestNotification(ntfyTopic).catch(() => {});

    return new Response(JSON.stringify(watch), { status: 201, headers: JSON_HEADERS });
  }

  if (req.method === "DELETE") {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return badRequest("id query param is required");
    await deleteWatch(id);
    return new Response(JSON.stringify({ ok: true }), { headers: JSON_HEADERS });
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: JSON_HEADERS,
  });
};
