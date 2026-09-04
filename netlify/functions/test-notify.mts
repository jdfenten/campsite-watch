import { sendTestNotification } from "./lib/checker.mts";

// Hit this to confirm an ntfy topic is wired up correctly:
//   https://<your-site>.netlify.app/.netlify/functions/test-notify?topic=<topic>
export default async (req: Request) => {
  const topic = new URL(req.url).searchParams.get("topic");
  if (!topic) {
    return new Response("Add ?topic=<your-ntfy-topic> to the URL and retry.", { status: 400 });
  }
  await sendTestNotification(topic);
  return new Response(`Sent a test notification to https://ntfy.sh/${topic}`);
};
