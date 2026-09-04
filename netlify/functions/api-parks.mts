import { PARKS } from "./lib/parks.mts";

// GET /.netlify/functions/api-parks — list every SC state park this tool
// can watch/search (camping-capable parks only).
export default async () => {
  return new Response(JSON.stringify(PARKS), {
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });
};
