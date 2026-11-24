// M1 smoke test: two pages, fake capture source, both sharing directions.
// Usage: pnpm e2e   (starts signaling + web dev servers itself)
//
// PAIRS picks the engines for peer A (joins first, answers) and peer B (joins
// second, offers): comma-separated "a:b" pairs of chromium | firefox | webkit,
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
  const open = async (name, query = "?fake=1") => {
    const context = await (await launch(name)).newContext();
    contexts.push(context);
    const page = await context.newPage();
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

  for (const [a, b] of pairs) {
    console.log(`\n${a} (A, answers) <-> ${b} (B, offers)`);
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
