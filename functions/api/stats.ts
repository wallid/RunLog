/**
 * The visit counter — the only code in this project that runs on a server.
 *
 * Every run is parsed in the visitor's own browser, so there is nothing here
 * that could count runs even if it wanted to. What a server can count is
 * visits: the landing page reports itself once per browser (see `src/stats.ts`
 * for the dedupe and for what the request carries, which is nothing), and this
 * function keeps the tally in KV. GET reads it; POST adds one.
 *
 * The write is read-add-write without a lock, so two simultaneous visits can
 * lose an increment. That makes the number approximate, and approximate in the
 * one direction acceptable for a figure the landing page shows as proof: it
 * only ever undercounts.
 */

interface StatsStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

interface Env {
  STATS: StatsStore;
}

const KEY = "visits";

async function currentCount(store: StatsStore): Promise<number> {
  const raw = await store.get(KEY);
  const parsed = raw === null ? 0 : Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function asJson(visits: number): Response {
  return new Response(JSON.stringify({ visits }), {
    headers: {
      "Content-Type": "application/json",
      // The number moves; a cached copy of it is a stale claim.
      "Cache-Control": "no-store",
    },
  });
}

export async function onRequestGet({ env }: { env: Env }): Promise<Response> {
  return asJson(await currentCount(env.STATS));
}

export async function onRequestPost({ env }: { env: Env }): Promise<Response> {
  const visits = (await currentCount(env.STATS)) + 1;
  await env.STATS.put(KEY, String(visits));
  return asJson(visits);
}
