import { after, afterEach, test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { io as connectClient, type Socket } from "socket.io-client";

// server.ts listens on import, so configure it first. Port 0 = any free port.
process.env.PORT = "0";
process.env.ALLOWED_ORIGINS = "http://allowed.test";
delete process.env.CF_TURN_KEY_ID;
const { httpServer, io } = await import("./server.js");
if (!httpServer.listening) await new Promise((r) => httpServer.once("listening", r));
const url = `http://localhost:${(httpServer.address() as AddressInfo).port}`;

const sockets: Socket[] = [];
let n = 0;
const newRoom = () => `testroom${n++}`;
const newId = () => `client-${n++}`.padEnd(20, "x");
const connect = (extraHeaders?: Record<string, string>) => {
  const s = connectClient(url, { transports: ["websocket"], forceNew: true, reconnection: false, extraHeaders });
  sockets.push(s);
  return s;
};
const join = (s: Socket, room: string, opts: object = { clientId: newId(), resume: false }) =>
  s.timeout(2000).emitWithAck("join", room, opts);
const next = (s: Socket, event: string) => new Promise<unknown[]>((r) => s.once(event, (...args) => r(args)));
/** Two sockets in a fresh room. */
const pair = async () => {
  const room = newRoom();
  const [a, b] = [connect(), connect()];
  await join(a, room);
  await join(b, room);
  return { room, a, b };
};

afterEach(() => sockets.splice(0).forEach((s) => s.close()));
after(() => io.close());

test("join: first waits, second sees a peer, third is refused", async () => {
  const room = newRoom();
  const [a, b, c] = [connect(), connect(), connect()];
  assert.deepEqual(await join(a, room), { ok: true, peerPresent: false });
  const joined = next(a, "peer-joined");
  assert.deepEqual(await join(b, room), { ok: true, peerPresent: true });
  assert.deepEqual(await joined, [false]);
  assert.deepEqual(await join(c, room), { ok: false, error: "room-full" });
});

test("join: bad room id, second join, and the old (room, ack) call shape", async () => {
  const a = connect();
  assert.deepEqual(await join(a, "short"), { ok: false, error: "invalid-room" });
  const room = newRoom();
  assert.equal((await a.timeout(2000).emitWithAck("join", room)).ok, true);
  assert.deepEqual(await join(a, newRoom()), { ok: false, error: "invalid-room" });
});

test("signal goes to the partner only, and only after joining", async () => {
  const { room, a, b } = await pair();
  const outsider = connect();
  let leaked = false;
  for (const s of [a, outsider]) s.on("signal", () => (leaked = true));
  const got = next(b, "signal");
  outsider.emit("signal", { kind: "ice-candidate", candidate: null });
  a.emit("signal", { kind: "offer", sdp: { type: "offer", sdp: room } });
  assert.deepEqual(await got, [{ kind: "offer", sdp: { type: "offer", sdp: room } }]);
  assert.equal(leaked, false);
});

test("chat: relayed trimmed and capped, empty refused, 5 per 3 s", async () => {
  const { a, b } = await pair();
  const got = next(b, "chat");
  assert.equal(await a.emitWithAck("chat", `  ${"x".repeat(600)}  `), true);
  const [msg] = (await got) as [{ text: string; ts: number }];
  assert.equal(msg.text, "x".repeat(500));
  assert.equal(await a.emitWithAck("chat", "   "), false);
  const acks = await Promise.all([1, 2, 3, 4, 5].map((i) => a.emitWithAck("chat", `m${i}`)));
  assert.deepEqual(acks, [true, true, true, true, false]);
});

test("disconnect tells the partner", async () => {
  const { a, b } = await pair();
  const left = next(a, "peer-left");
  b.close();
  await left;
});

test("rejoin with the same clientId replaces the stale socket without a peer-left", async () => {
  const room = newRoom();
  const clientId = newId();
  const [stale, partner, back] = [connect(), connect(), connect()];
  await join(stale, room, { clientId, resume: false });
  await join(partner, room);
  let peerLeft = false;
  partner.on("peer-left", () => (peerLeft = true));
  const kicked = next(stale, "disconnect");
  const rejoined = next(partner, "peer-joined");
  // Without the eviction this would be room-full.
  assert.deepEqual(await join(back, room, { clientId, resume: true }), { ok: true, peerPresent: true });
  assert.deepEqual(await rejoined, [true]);
  await kicked;
  assert.equal(peerLeft, false);
  // The seat is still taken by the new socket.
  assert.deepEqual(await join(connect(), room), { ok: false, error: "room-full" });
});

test("a different clientId cannot take a seat", async () => {
  const { room } = await pair();
  assert.deepEqual(await join(connect(), room), { ok: false, error: "room-full" });
});

test("WebSocket upgrade from an unlisted origin is refused", async () => {
  const bad = connect({ origin: "https://evil.test" });
  await next(bad, "connect_error");
  const good = connect({ origin: "http://allowed.test" });
  await next(good, "connect");
});

test("http: malformed target is a 400, not a crash; /ice needs a live room", async () => {
  assert.equal((await fetch(`${url}//`)).status, 400);
  assert.equal((await fetch(`${url}/health`)).status, 200);
  assert.equal((await fetch(`${url}/ice?room=${newRoom()}`)).status, 404);
  const room = newRoom();
  await join(connect(), room);
  const res = await fetch(`${url}/ice?room=${room}`);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).turn, false);
});
