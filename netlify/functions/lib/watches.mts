import { getStore } from "@netlify/blobs";
import type { Watch } from "./checker.mts";

function store() {
  return getStore("campsite-watch-watches");
}

export async function listWatches(): Promise<Watch[]> {
  const s = store();
  const { blobs } = await s.list();
  const watches = await Promise.all(
    blobs.map((b) => s.get(b.key, { type: "json" }) as Promise<Watch | null>)
  );
  return watches.filter((w): w is Watch => !!w).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getWatch(id: string): Promise<Watch | null> {
  return (await store().get(id, { type: "json" })) as Watch | null;
}

export async function saveWatch(watch: Watch): Promise<void> {
  await store().setJSON(watch.id, watch);
}

export async function deleteWatch(id: string): Promise<void> {
  await store().delete(id);
}

export function randomTopicSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}
