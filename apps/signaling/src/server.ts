import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Server, type DefaultEventsMap } from "socket.io";
import {
  CHAT_MAX_LENGTH,
  ICE_PATH,
  MAX_PEERS_PER_ROOM,
  ROOM_ID_PATTERN,
  type ClientToServerEvents,
  type IceErrorCode,
  type JoinOptions,
  type JoinResult,
  type ServerToClientEvents,
} from "@dagleitv/protocol";
import { createIceProvider, createRateLimiter } from "./ice.js";

const port = Number(process.env.PORT ?? 4000);
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

// Behind a reverse proxy (Fly, Render, nginx) the socket address is the proxy's.
// With TRUST_PROXY=1 the last X-Forwarded-For entry, appended by the nearest
// proxy, is used instead.
const trustProxy = process.env.TRUST_PROXY === "1";
const clientIp = (req: IncomingMessage): string => {
  if (trustProxy) {
    const xff = String(req.headers["x-forwarded-for"] ?? "").split(",");
    const last = xff[xff.length - 1]?.trim();
    if (last) return last;
  }
  return req.socket.remoteAddress ?? "unknown";
};

// Logged once per boot so the proxy setup can be checked: if "resolved" is not
// the visitor's address, every user shares one /ice rate-limit bucket.
let ipLogged = false;
const logClientIpOnce = (req: IncomingMessage) => {
  if (ipLogged) return;
  ipLogged = true;
  const h = (name: string) => JSON.stringify(req.headers[name] ?? null);
  console.log(
    `client ip check: resolved=${clientIp(req)} x-forwarded-for=${h("x-forwarded-for")} cf-connecting-ip=${h("cf-connecting-ip")}`,
  );
};

const ice = createIceProvider();
// `|| default` so a non-numeric value doesn't become NaN and block everyone.
const iceAllowed = createRateLimiter(
  Number(process.env.ICE_RATE_LIMIT) || 10,
  Number(process.env.ICE_RATE_WINDOW_MS) || 60_000,
);
// Per socket. A full negotiation is a few dozen messages (offer, answer, ICE trickle).
const signalAllowed = createRateLimiter(200, 10_000);

const corsHeaders = (req: IncomingMessage): Record<string, string> => {
  const origin = req.headers.origin;
  return origin && allowedOrigins.includes(origin)
    ? { "access-control-allow-origin": origin, vary: "Origin" }
    : {};
};

const sendJson = (req: IncomingMessage, res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
    ...corsHeaders(req),
  });
  res.end(JSON.stringify(body));
};

const httpServer = createServer((req, res) => {
  // A request target such as "//" makes URL throw; uncaught, that kills the process.
  let url: URL;
  try {
    url = new URL(req.url ?? "/", "http://localhost");
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "content-type": "text/plain", ...corsHeaders(req) });
    res.end("ok");
    return;
  }
  if (req.method === "GET" && url.pathname === ICE_PATH) {
    void handleIce(req, res, url);
    return;
  }
  res.writeHead(404).end();
});

// TURN credentials cost money per GB. The rate limit and the live-room check
// only stop casual misuse: a script can join any made-up room and then ask.
// The real cap is the short TTL (ice.ts) plus a usage alert in Cloudflare.
// The caller must join the room first (see PeerSession.start).
async function handleIce(req: IncomingMessage, res: ServerResponse, url: URL) {
  const fail = (status: number, error: IceErrorCode) => sendJson(req, res, status, { error });
  logClientIpOnce(req);
  if (!iceAllowed(clientIp(req))) return fail(429, "rate-limited");
  const room = url.searchParams.get("room") ?? "";
  if (!ROOM_ID_PATTERN.test(room)) return fail(400, "invalid-room");
  if (!io.sockets.adapter.rooms.get(room)?.size) return fail(404, "no-such-room");
  sendJson(req, res, 200, await ice.get());
}

interface SocketData {
  clientId?: string;
  /** Replaced by the same client's new socket: its disconnect is not a departure. */
  evicted?: boolean;
}

const io = new Server<ClientToServerEvents, ServerToClientEvents, DefaultEventsMap, SocketData>(httpServer, {
  cors: { origin: allowedOrigins },
  transports: ["websocket"],
  // SDP is a few KB; the 1 MB default only helps someone abusing the relay.
  maxHttpBufferSize: 64_000,
  // `cors` only covers HTTP polling, so check the Origin of WebSocket upgrades
  // here. No Origin means a non-browser client, which could forge one anyway.
  allowRequest: (req, cb) => cb(null, !req.headers.origin || allowedOrigins.includes(req.headers.origin)),
});

io.on("connection", (socket) => {
  let roomId: string | null = null;

  socket.on("join", async (requestedRoom, opts: unknown, maybeAck: unknown) => {
    // Clients from before JoinOptions send (room, ack).
    const ack = (typeof opts === "function" ? opts : maybeAck) as ((result: JoinResult) => void) | undefined;
    if (typeof ack !== "function") return;
    const { clientId, resume } = (typeof opts === "object" && opts ? opts : {}) as Partial<JoinOptions>;
    if (roomId || typeof requestedRoom !== "string" || !ROOM_ID_PATTERN.test(requestedRoom)) {
      ack({ ok: false, error: "invalid-room" });
      return;
    }
    // The same client coming back after a network drop: its old socket can look
    // alive here for up to ~45 s. Drop it quietly so the seat is free and the
    // partner is not told that anyone left.
    if (typeof clientId === "string" && clientId.length >= 16 && clientId.length <= 64) {
      for (const id of [...(io.sockets.adapter.rooms.get(requestedRoom) ?? [])]) {
        const old = io.sockets.sockets.get(id);
        if (old?.data.clientId !== clientId) continue;
        old.data.evicted = true;
        void old.leave(requestedRoom);
        old.disconnect(true);
      }
      socket.data.clientId = clientId;
    }
    const existing = io.sockets.adapter.rooms.get(requestedRoom)?.size ?? 0;
    if (existing >= MAX_PEERS_PER_ROOM) {
      ack({ ok: false, error: "room-full" });
      return;
    }
    roomId = requestedRoom;
    await socket.join(requestedRoom);
    ack({ ok: true, peerPresent: existing > 0 });
    socket.to(requestedRoom).emit("peer-joined", resume === true);
  });

  // Pure relay: forward to the other peer in the room, never inspect SDP.
  socket.on("signal", (msg) => {
    if (roomId && signalAllowed(socket.id)) socket.to(roomId).emit("signal", msg);
  });

  // Text chat: relayed to the other peer only (the sender shows its own copy).
  // Per-socket limit of 5 messages per 3 seconds.
  let chatTimes: number[] = [];
  socket.on("chat", (text, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    if (!roomId || typeof text !== "string") return reply(false);
    const trimmed = text.trim().slice(0, CHAT_MAX_LENGTH);
    if (!trimmed) return reply(false);
    const now = Date.now();
    chatTimes = chatTimes.filter((t) => now - t < 3000);
    if (chatTimes.length >= 5) return reply(false);
    chatTimes.push(now);
    socket.to(roomId).emit("chat", { text: trimmed, ts: now });
    reply(true);
  });

  socket.on("disconnect", () => {
    if (roomId && !socket.data.evicted) socket.to(roomId).emit("peer-left");
  });
});

export { httpServer, io };

httpServer.listen(port, () => {
  console.log(
    `signaling listening on :${port} (origins: ${allowedOrigins.join(", ")}; TURN ${ice.turnConfigured ? "enabled" : "disabled, STUN only"})`,
  );
});
