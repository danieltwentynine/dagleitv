// M1 smoke test: two pages, fake capture source, both sharing directions.
// Usage: pnpm e2e   (starts signaling + web dev servers itself)
//
// PAIRS picks the engines for peer A (joins first, so it gets peer-joined and
// offers) and peer B (joins second, answers): comma-separated "a:b" pairs of chromium | firefox | webkit,
// or "all" for every combination. Default "chromium:chromium".
//   PAIRS=chromium:firefox,firefox:chromium pnpm e2e
// These are Playwright's builds, not branded browsers: its WebKit is not Safari
// and its Firefox is patched. Media is the synthetic ?fake source, not real
// screen capture. Real-browser runs stay manual.
// Run `pnpm exec playwright-core install chromium firefox webkit` once first.
import { spawn } from "node:child_process";
import { chromium, firefox, webkit } from "playwright-core";

const WEB = "http://localhost:3000";
const ENGINES = { chromium, firefox, webkit };
const LAUNCH = {
  chromium: {
    executablePath: process.env.CHROMIUM_PATH,
    args: ["--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream"],
  },
  firefox: {
    firefoxUserPrefs: {
      "media.navigator.streams.fake": true,
      "media.navigator.permission.disabled": true,
      "media.autoplay.default": 0,
      "media.autoplay.blocking_policy": 0,
    },
  },
  webkit: {},
};
const names = Object.keys(ENGINES);
const pairs = (process.env.PAIRS ?? "chromium:chromium") === "all"
  ? names.flatMap((a) => names.map((b) => [a, b]))
  : process.env.PAIRS.split(",").map((p) => p.trim().split(":"));
for (const p of pairs) if (p.length !== 2 || !p.every((n) => n in ENGINES)) throw new Error(`bad PAIRS entry: ${p.join(":")}`);

const procs = [];
const start = (cmd, args, env = {}) => {
  const p = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: "pipe", detached: true });
  procs.push(p);
  return p;
};
const waitFor = async (url, ms = 60000) => {
  const t = Date.now();
  while (Date.now() - t < ms) {
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`timeout waiting for ${url}`);
};
const assert = (cond, msg) => { if (!cond) throw new Error("ASSERT: " + msg); console.log("  ok -", msg); };

const browsers = {};
const launch = async (name) => (browsers[name] ??= await ENGINES[name].launch(LAUNCH[name]));

async function runPair(nameA, nameB) {
  const room = "e2eroom" + Math.random().toString(36).slice(2, 8);
  const contexts = [];
  const pages = [];
  const open = async (name, query = "?fake=1") => {
    const context = await (await launch(name)).newContext();
    contexts.push(context);
    const page = await context.newPage();
    pages.push([name, page]);
    // Keep every RTCPeerConnection reachable, for the simulated drop below.
    await page.addInitScript(() => {
      const Native = window.RTCPeerConnection;
      window.__pcs = [];
      window.RTCPeerConnection = function (...args) {
        const pc = new Native(...args);
        window.__pcs.push(pc);
        return pc;
      };
      window.RTCPeerConnection.prototype = Native.prototype;
    });
    page.on("pageerror", (e) => console.log(`  pageerror (${name}):`, e.message));
    await page.goto(`${WEB}/room/${room}${query}`);
    return page;
  };
  const join = async (page) => { await page.getByTestId("join").click(); await page.getByTestId("phase").waitFor(); };

  try {
    const a = await open(nameA), b = await open(nameB);
    await join(a); await join(b);
    await a.getByTestId("phase").filter({ hasText: "connected" }).waitFor({ timeout: 20000 });
    await b.getByTestId("phase").filter({ hasText: "connected" }).waitFor({ timeout: 20000 });
    assert(true, "both peers reach 'connected'");

    const c = await open(nameA);
    await c.getByTestId("join").click();
    await c.getByText("Room full", { exact: true }).waitFor({ timeout: 5000 });
    assert(true, "third peer is rejected (room full)");

    const check = async (viewer, label) => {
      await viewer.getByTestId("remote-sharing").filter({ hasText: "partner is sharing" }).waitFor({ timeout: 10000 });
      await viewer.waitForFunction(() => {
        const v = document.querySelector("video");
        return v && v.videoWidth > 0 && v.currentTime > 0.5;
      }, null, { timeout: 15000 });
      const info = await viewer.evaluate(() => {
        const s = document.querySelector("video").srcObject;
        return { video: s.getVideoTracks().length, audio: s.getAudioTracks().length };
      });
      assert(info.video === 1 && info.audio === 1, `${label}: received 1 video + 1 audio track`);
      assert(true, `${label}: video is playing`);
    };

    await a.getByTestId("share").click();
    await check(b, "A shares -> B");
    await a.getByTestId("stop-share").click();
    await b.waitForFunction(() => document.querySelector('[data-testid="remote-sharing"]').textContent === "", null, { timeout: 5000 });
    assert(true, "B sees A stop sharing");

    await b.getByTestId("share").click();
    await check(a, "B shares -> A (no renegotiation)");

    // B leaves mid-share by reloading: A must drop the old call and accept a
    // fresh one without ending up "failed".
    b.on("dialog", (d) => void d.accept()); // "Leave site?" while sharing
    await b.reload();
    await join(b);
    await a.getByTestId("phase").filter({ hasText: "connected" }).waitFor({ timeout: 20000 });
    await b.getByTestId("phase").filter({ hasText: "connected" }).waitFor({ timeout: 20000 });
    assert(true, "after B reloads, both peers reconnect");
    await a.getByTestId("share").click();
    await check(b, "A shares -> B on the new connection");

    // Simulated network drop on the offerer (A). Real UDP can't be cut from
    // here, so A's connection is made to report "disconnected"; the ICE
    // restart that follows is real and must happen on the same connections.
    const ufrag = (p) => p.evaluate(() => window.__pcs.at(-1).localDescription.sdp.match(/a=ice-ufrag:(\S+)/)[1]);
    const pcCount = (p) => p.evaluate(() => window.__pcs.length);
    const [ufragA, ufragB, countB] = [await ufrag(a), await ufrag(b), await pcCount(b)];
    await a.evaluate(() => {
      const pc = window.__pcs.at(-1);
      Object.defineProperty(pc, "connectionState", { configurable: true, get: () => "disconnected" });
      pc.onconnectionstatechange(new Event("connectionstatechange")); // Firefox ignores dispatched ones
    });
    await a.getByTestId("phase").filter({ hasText: "reconnecting" }).waitFor({ timeout: 2000 });
    assert(true, "drop -> A shows 'reconnecting'");
    await a.waitForFunction((u) => window.__pcs.at(-1).localDescription.sdp.match(/a=ice-ufrag:(\S+)/)[1] !== u
      && window.__pcs.at(-1).signalingState === "stable", ufragA, { timeout: 10000 });
    assert((await ufrag(b)) !== ufragB && (await pcCount(b)) === countB, "ICE restart answered on B's existing connection");
    await a.evaluate(() => {
      const pc = window.__pcs.at(-1);
      delete pc.connectionState; // back to the real getter
      pc.onconnectionstatechange(new Event("connectionstatechange")); // Firefox ignores dispatched ones
    });
    await a.waitForFunction(() => !/reconnecting/.test(document.querySelector('[data-testid="phase"]').textContent), null, { timeout: 10000 });
    assert(true, "A leaves 'reconnecting' once the connection reports connected");
    const t0 = await b.evaluate(() => document.querySelector("video").currentTime);
    await b.waitForFunction((t) => document.querySelector("video").currentTime > t + 1, t0, { timeout: 10000 });
    assert(true, "B's video keeps playing after the restart");
  } catch (e) {
    // What the connections looked like, without addresses: candidate types and
    // whether each address is an mDNS name.
    for (const [name, page] of pages) {
      const info = await page.evaluate(async () => {
        const pc = window.__pcs?.at(-1);
        if (!pc) return "no peer connection";
        const kinds = (sdp) => [...(sdp ?? "").matchAll(/a=candidate:\S+ \d (\S+) \d+ (\S+) \d+ typ (\S+)/g)]
          .map(([, proto, addr, typ]) => `${typ}/${proto.toLowerCase()}${addr.endsWith(".local") ? "/mdns" : ""}`);
        const stats = [];
        (await pc.getStats()).forEach((r) => {
          if (r.type === "local-candidate" || r.type === "remote-candidate") {
            stats.push(`${r.type[0]}:${r.candidateType}/${r.protocol}${String(r.address ?? r.ip ?? "").endsWith(".local") ? "/mdns" : ""}`);
          }
          if (r.type === "candidate-pair") stats.push(`pair:${r.state}${r.nominated ? "*" : ""}`);
        });
        return { conn: pc.connectionState, ice: pc.iceConnectionState, gather: pc.iceGatheringState,
          sig: pc.signalingState, localSdp: kinds(pc.localDescription?.sdp), remoteSdp: kinds(pc.remoteDescription?.sdp), stats };
      }).catch((err) => `evaluate failed: ${err.message}`);
      console.log(`  diag ${name}:`, JSON.stringify(info));
    }
    throw e;
  } finally {
    await Promise.all(contexts.map((c) => c.close().catch(() => {})));
  }
}

const results = [];
try {
  start("pnpm", ["dev:signaling"]);
  start("pnpm", ["dev:web"]);
  await waitFor("http://localhost:4000/health");
  await waitFor(WEB);
  await waitFor(`${WEB}/room/warmup0000`, 120000); // compile the room route before timing anything

  for (const [a, b] of pairs) {
    console.log(`\n${a} (A, offers) <-> ${b} (B, answers)`);
    try {
      await runPair(a, b);
      results.push([a, b, "PASS"]);
    } catch (e) {
      console.error("  FAILED:", e.message.split("\n")[0]);
      results.push([a, b, "FAIL"]);
    }
  }
} catch (e) {
  console.error("M1 e2e setup FAILED:", e.message);
  process.exitCode = 1;
} finally {
  for (const b of Object.values(browsers)) await b.close().catch(() => {});
  if (results.length) {
    console.log("\nA \\ B results:");
    for (const [a, b, r] of results) console.log(`  ${r}  ${a} -> ${b}`);
    console.log(results.every((r) => r[2] === "PASS") ? "M1 e2e PASSED" : "M1 e2e FAILED");
    if (results.some((r) => r[2] !== "PASS")) process.exitCode = 1;
  }
  procs.forEach((p) => { try { process.kill(-p.pid, "SIGTERM"); } catch {} });
  setTimeout(() => process.exit(process.exitCode ?? 0), 500);
}
