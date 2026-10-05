// M2 check for the signaling server's /ice endpoint (no browser needed).
// Usage: pnpm e2e:ice   (starts the signaling server itself, STUN-only mode)
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(new URL("../packages/rtc-core/package.json", import.meta.url));
const { io } = require("socket.io-client");

const PORT = 4010;
const BASE = `http://localhost:${PORT}`;
const server = spawn("pnpm", ["--filter", "@dagleitv/signaling", "start"], {
  env: {
    ...process.env, PORT: String(PORT), ICE_RATE_LIMIT: "6", ICE_RATE_WINDOW_MS: "60000",
    CF_TURN_KEY_ID: "", CF_TURN_API_TOKEN: "",
  },
  stdio: "pipe", detached: true, shell: process.platform === "win32",
});
const assert = (cond, msg) => { if (!cond) throw new Error("ASSERT: " + msg); console.log("ok -", msg); };
const ice = (room) => fetch(`${BASE}/ice?room=${room}`, { headers: { origin: "http://localhost:3000" } });

try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(`${BASE}/health`)).ok) break; } catch {}
    if (i > 60) throw new Error("signaling did not start");
    await new Promise((r) => setTimeout(r, 500));
  }
  const room = "icecheck" + Math.random().toString(36).slice(2, 8);

  assert((await ice("abc")).status === 400, "malformed room code -> 400");
  assert((await ice(room)).status === 404, "room with nobody in it -> 404 (no credentials)");

  const sock = io(BASE, { transports: ["websocket"] });
  await new Promise((r) => sock.on("connect", r));
  await new Promise((r) => sock.emit("join", room, r));

  const res = await ice(room);
  const body = await res.json();
  assert(res.status === 200 && Array.isArray(body.iceServers) && body.iceServers.length > 0, "live room -> 200 with iceServers");
  assert(body.turn === false, "no Cloudflare keys -> STUN only (turn: false)");
  assert(res.headers.get("access-control-allow-origin") === "http://localhost:3000", "CORS echoes the allowed origin");

  // 5 requests so far count toward the limit of 6; push past it.
  const statuses = [];
  for (let i = 0; i < 4; i++) statuses.push((await ice(room)).status);
  assert(statuses.includes(429), "rate limit kicks in -> 429");
  sock.close();
  console.log("M2 /ice e2e PASSED");
} catch (e) {
  console.error("M2 /ice e2e FAILED:", e.message);
  process.exitCode = 1;
} finally {
  try { process.platform === "win32" ? spawn("taskkill", ["/pid", String(server.pid), "/T", "/F"]) : process.kill(-server.pid, "SIGTERM"); } catch {}
  setTimeout(() => process.exit(process.exitCode ?? 0), 500);
}
