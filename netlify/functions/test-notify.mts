// Hit this once to confirm your ntfy topic is wired up correctly:
//   https://<your-site>.netlify.app/.netlify/functions/test-notify
declare const Netlify: { env: { get(key: string): string | undefined } };

export default async () => {
  const NTFY_TOPIC = Netlify.env.get("NTFY_TOPIC");
  const NTFY_URL = Netlify.env.get("NTFY_URL") || (NTFY_TOPIC ? `https://ntfy.sh/${NTFY_TOPIC}` : undefined);

  if (!NTFY_URL) {
    return new Response(
      "NTFY_TOPIC (or NTFY_URL) env var is not set on this site. Set it in Netlify site settings, then retry.",
      { status: 500 }
    );
  }

  await fetch(NTFY_URL, {
    method: "POST",
    headers: { title: "Campsite Watch — test", priority: "default", tags: "white_check_mark" },
    body: "If you got this, your campsite-watch notifications are wired up correctly.",
  });

  return new Response(`Sent a test notification to ${NTFY_URL}`);
};
