// M1 smoke test: two pages, fake capture source, both sharing directions.
// Usage: pnpm e2e   (starts signaling + web dev servers itself)
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";

const WEB = "http://localhost:3000";
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
const assert = (cond, msg) => { if (!cond) throw new Error("ASSERT: " + msg); console.log("ok -", msg); };

try {
  start("pnpm", ["dev:signaling"]);
  start("pnpm", ["dev:web"]);
  await waitFor("http://localhost:4000/health");
  await waitFor(WEB);

  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH,
    args: ["--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream"],
  });
  const room = "e2eroom" + Math.random().toString(36).slice(2, 8);
  const open = async (query = "?fake=1") => {
    const page = await (await browser.newContext()).newPage();
    page.on("pageerror", (e) => console.log("pageerror:", e.message));
    await page.goto(`${WEB}/room/${room}${query}`);
    return page;
  };
  const join = async (page) => { await page.getByTestId("join").click(); await page.getByTestId("phase").waitFor(); };

  const a = await open(), b = await open();
  await join(a); await join(b);
  await a.getByTestId("phase").filter({ hasText: "connected" }).waitFor({ timeout: 20000 });
  await b.getByTestId("phase").filter({ hasText: "connected" }).waitFor({ timeout: 20000 });
  assert(true, "both peers reach 'connected'");

  const c = await open();
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
  await b.getByTestId("remote-sharing").filter({ hasText: "partner is sharing" }).waitFor({ state: "detached", timeout: 1 }).catch(() => {});
  await b.waitForFunction(() => document.querySelector('[data-testid="remote-sharing"]').textContent === "", null, { timeout: 5000 });
  assert(true, "B sees A stop sharing");

  await b.getByTestId("share").click();
  await check(a, "B shares -> A (no renegotiation)");

  await browser.close();
  console.log("M1 e2e PASSED");
} catch (e) {
  console.error("M1 e2e FAILED:", e.message);
  process.exitCode = 1;
} finally {
  procs.forEach((p) => { try { process.kill(-p.pid, "SIGTERM"); } catch {} });
  setTimeout(() => process.exit(process.exitCode ?? 0), 500);
}
