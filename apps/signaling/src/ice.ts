import type { IceServersResponse } from "@dagleitv/protocol";

const STUN_ONLY: IceServersResponse = {
  iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }],
  turn: false,
};

/** Credential lifetime requested from Cloudflare. Reused until half is left. */
const TTL_SECONDS = 6 * 60 * 60;

interface Cached {
  value: IceServersResponse;
  refreshAt: number;
}

/**
 * Mints short-lived Cloudflare Realtime TURN credentials. Without
 * CF_TURN_KEY_ID / CF_TURN_API_TOKEN it degrades to STUN only, so local
 * development works with no account.
 *
 * Endpoint and response shape follow Cloudflare's docs from memory; verify
 * against the current Realtime TURN API reference before relying on them.
 */
export function createIceProvider(env: NodeJS.ProcessEnv = process.env) {
  const keyId = env.CF_TURN_KEY_ID;
  const apiToken = env.CF_TURN_API_TOKEN;
  let cached: Cached | null = null;
  let inflight: Promise<IceServersResponse> | null = null;

  const mint = async (): Promise<IceServersResponse> => {
    const res = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${apiToken}`, "content-type": "application/json" },
        body: JSON.stringify({ ttl: TTL_SECONDS }),
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok) throw new Error(`Cloudflare TURN API returned ${res.status}`);
    const body = (await res.json()) as { iceServers?: unknown };
    // `generate-ice-servers` returns an array; the older `generate` endpoint
    // returns a single object. Accept both.
    const list = Array.isArray(body.iceServers) ? body.iceServers : body.iceServers ? [body.iceServers] : [];
    if (list.length === 0) throw new Error("Cloudflare TURN API returned no iceServers");
    cached = {
      value: { iceServers: list as IceServersResponse["iceServers"], turn: true },
      refreshAt: Date.now() + (TTL_SECONDS * 1000) / 2,
    };
    return cached.value;
  };

  return {
    turnConfigured: Boolean(keyId && apiToken),
    async get(): Promise<IceServersResponse> {
      if (!keyId || !apiToken) return STUN_ONLY;
      if (cached && Date.now() < cached.refreshAt) return cached.value;
      try {
        inflight ??= mint().finally(() => (inflight = null));
        return await inflight;
      } catch (err) {
        console.error("TURN credential mint failed, falling back to STUN:", (err as Error).message);
        return cached?.value ?? STUN_ONLY;
      }
    },
  };
}

/** Fixed-window per-key limiter. Entries are pruned lazily. */
export function createRateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (key: string): boolean => {
    const now = Date.now();
    if (hits.size > 1000) for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    entry.count += 1;
    return entry.count <= limit;
  };
}
