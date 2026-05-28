import { redis } from "../../queues/redis.js";

const STATE_KEY = "circuit:state";
const OPENED_AT_KEY = "circuit:opened_at";
const FAILURES_KEY = "circuit:failure_timestamps";
const HALF_OPEN_PROBE_KEY = "circuit:half_open_probe";

const OPEN_WINDOW_MS = 30_000;
const FAILURE_WINDOW_MS = 60_000;
const FAILURE_THRESHOLD = 3;

export async function canProceed(): Promise<boolean> {
  const state = (await redis.get(STATE_KEY)) ?? "CLOSED";
  if (state === "CLOSED") {
    return true;
  }
  if (state === "OPEN") {
    const openedAt = Number((await redis.get(OPENED_AT_KEY)) ?? "0");
    if (Date.now() - openedAt >= OPEN_WINDOW_MS) {
      await redis.set(STATE_KEY, "HALF_OPEN");
      await redis.set(HALF_OPEN_PROBE_KEY, "1");
      return true;
    }
    return false;
  }
  return true;
}

export async function markSuccess(): Promise<void> {
  await redis
    .multi()
    .set(STATE_KEY, "CLOSED")
    .del(FAILURES_KEY)
    .del(OPENED_AT_KEY)
    .del(HALF_OPEN_PROBE_KEY)
    .exec();
}

export async function markFailure(): Promise<void> {
  const now = Date.now();
  await redis.rpush(FAILURES_KEY, String(now));
  const all = (await redis.lrange(FAILURES_KEY, 0, -1)).map(Number);
  const recent = all.filter((timestamp) => now - timestamp <= FAILURE_WINDOW_MS);
  await redis.del(FAILURES_KEY);
  if (recent.length > 0) {
    await redis.rpush(FAILURES_KEY, ...recent.map(String));
  }
  if (recent.length >= FAILURE_THRESHOLD) {
    await redis.multi().set(STATE_KEY, "OPEN").set(OPENED_AT_KEY, String(now)).exec();
    return;
  }
  const state = (await redis.get(STATE_KEY)) ?? "CLOSED";
  if (state === "HALF_OPEN") {
    await redis.set(STATE_KEY, "OPEN");
    await redis.set(OPENED_AT_KEY, String(now));
  }
}

export async function getCircuitState(): Promise<{ state: string; openedAt: string | null; halfOpenProbe: string | null }> {
  const [state, openedAt, halfOpenProbe] = await Promise.all([
    redis.get(STATE_KEY),
    redis.get(OPENED_AT_KEY),
    redis.get(HALF_OPEN_PROBE_KEY)
  ]);
  return {
    state: state ?? "CLOSED",
    openedAt,
    halfOpenProbe
  };
}

export async function resetCircuitForTests(): Promise<void> {
  await redis.del(STATE_KEY, OPENED_AT_KEY, FAILURES_KEY, HALF_OPEN_PROBE_KEY);
}
