import { test } from "node:test";
import assert from "node:assert/strict";
import { createIceProvider, createRateLimiter } from "./ice.js";

const env = { CF_TURN_KEY_ID: "k", CF_TURN_API_TOKEN: "t" };
const turn = { urls: ["turn:turn.cloudflare.com:3478"], username: "u", credential: "c" };

function stubFetch(body: unknown, status = 200) {
  const calls: string[] = [];
  globalThis.fetch = (async (url: string) => {
    calls.push(url);
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return calls;
}

test("no Cloudflare keys -> STUN only, no API call", async () => {
  const calls = stubFetch({});
  const ice = await createIceProvider({}).get();
  assert.equal(ice.turn, false);
  assert.equal(calls.length, 0);
});

test("accepts iceServers as an array or a single object, and caches", async () => {
  for (const iceServers of [[turn], turn]) {
    const calls = stubFetch({ iceServers });
    const provider = createIceProvider(env);
    assert.deepEqual(await provider.get(), { iceServers: [turn], turn: true });
    await provider.get();
    assert.equal(calls.length, 1);
  }
});

test("API error or empty body -> STUN fallback", async () => {
  stubFetch({}, 500);
  assert.equal((await createIceProvider(env).get()).turn, false);
  stubFetch({ iceServers: [] });
  assert.equal((await createIceProvider(env).get()).turn, false);
});

test("rate limiter allows `limit` calls per key per window", () => {
  const allow = createRateLimiter(2, 60_000);
  assert.deepEqual([allow("a"), allow("a"), allow("a"), allow("b")], [true, true, false, true]);
});
