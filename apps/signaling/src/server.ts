import { createServer } from "node:http";
import { Server } from "socket.io";
import {
  MAX_PEERS_PER_ROOM,
  ROOM_ID_PATTERN,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from "@dagleitv/protocol";

const port = Number(process.env.PORT ?? 4000);
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const httpServer = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, {
      "content-type": "text/plain",
      "access-control-allow-origin": allowedOrigins.join(","),
    });
    res.end("ok");
    return;
  }
  res.writeHead(404).end();
});

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
  console.log(`signaling listening on :${port} (origins: ${allowedOrigins.join(", ")})`);
});
