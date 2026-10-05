import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Server } from "socket.io";
import {
  ICE_PATH,
  MAX_PEERS_PER_ROOM,
  ROOM_ID_PATTERN,
  type ClientToServerEvents,
  type IceErrorCode,
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

const ice = createIceProvider();
const iceAllowed = createRateLimiter(
  Number(process.env.ICE_RATE_LIMIT ?? 10),
  Number(process.env.ICE_RATE_WINDOW_MS ?? 60_000),
);

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
  const url = new URL(req.url ?? "/", "http://localhost");
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

// TURN credentials cost money per GB, so only hand them to someone who is
// (a) under the rate limit and (b) naming a room that already has a live peer
// in it. The caller must join the room first (see PeerSession.start).
async function handleIce(req: IncomingMessage, res: ServerResponse, url: URL) {
  const fail = (status: number, error: IceErrorCode) => sendJson(req, res, status, { error });
  if (!iceAllowed(clientIp(req))) return fail(429, "rate-limited");
  const room = url.searchParams.get("room") ?? "";
  if (!ROOM_ID_PATTERN.test(room)) return fail(400, "invalid-room");
  if (!io.sockets.adapter.rooms.get(room)?.size) return fail(404, "no-such-room");
  sendJson(req, res, 200, await ice.get());
}

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: allowedOrigins },
  transports: ["websocket"],
});

io.on("connection", (socket) => {
  let roomId: string | null = null;

  socket.on("join", async (requestedRoom, ack) => {
    if (typeof ack !== "function") return;
    if (roomId || typeof requestedRoom !== "string" || !ROOM_ID_PATTERN.test(requestedRoom)) {
      ack({ ok: false, error: "invalid-room" });
      return;
    }
    const existing = await io.in(requestedRoom).fetchSockets();
    if (existing.length >= MAX_PEERS_PER_ROOM) {
      ack({ ok: false, error: "room-full" });
      return;
    }
    roomId = requestedRoom;
    await socket.join(requestedRoom);
    ack({ ok: true, peerPresent: existing.length > 0 });
    socket.to(requestedRoom).emit("peer-joined");
  });

  // Pure relay: forward to the other peer in the room, never inspect SDP.
  socket.on("signal", (msg) => {
    if (roomId) socket.to(roomId).emit("signal", msg);
  });

  socket.on("disconnect", () => {
    if (roomId) socket.to(roomId).emit("peer-left");
  });
});

httpServer.listen(port, () => {
  console.log(
    `signaling listening on :${port} (origins: ${allowedOrigins.join(", ")}; TURN ${ice.turnConfigured ? "enabled" : "disabled, STUN only"})`,
  );
});
