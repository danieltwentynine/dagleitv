// Voice chat (M4) check against already-running dev servers (pnpm dev:signaling + pnpm dev:web).
// Usage: pnpm e2e:voice   (CHROMIUM_PATH overrides the browser; SHOTS=<dir> saves screenshots)
// The fake mic (?fake=1) is a steady tone, so "speaking" should stay on while unmuted.
import { chromium } from "playwright-core";

const WEB = process.env.WEB_URL ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS;
const CHROME = process.env.CHROMIUM_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const assert = (c, m) => { if (!c) throw new Error("ASSERT: " + m); console.log("ok -", m); };
const browser = await chromium.launch({
  executablePath: CHROME,
  args: ["--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream"],
});
const room = "voicechk" + Math.random().toString(36).slice(2, 8);
const open = async (q) => {
  const p = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  p.on("pageerror", (e) => console.log("pageerror:", e.message));
  p.on("dialog", (d) => void d.accept()); // "Leave site?" on reload while the mic is on
  p.on("console", (m) => { if (m.type() === "error" && !/favicon|404/.test(m.text())) console.log("console.error:", m.text()); });
  await p.goto(`${WEB}/room/${room}${q}`);
  await p.getByTestId("join").click();
  return p;
};
const partnerMic = (p, attr, value, msg) =>
  p.waitForFunction(([a, v]) => document.querySelector('[data-testid="partner-mic"]')?.getAttribute(a) === v, [attr, value], { timeout: 10000 })
    .then(() => assert(true, msg));
const voiceFlowing = (p) => p.evaluate(async () => {
  const a = document.querySelector('[data-testid="remote-voice"]');
  const t0 = a.currentTime; await new Promise((r) => setTimeout(r, 700));
  return { tracks: a.srcObject?.getAudioTracks().length ?? 0, advancing: a.currentTime > t0, paused: a.paused };
});
try {
  const a = await open("?fake=1"), b = await open("?fake=1&relay=1");
  for (const p of [a, b]) await p.getByTestId("phase").filter({ hasText: "connected" }).waitFor({ timeout: 20000 });
  await partnerMic(b, "data-state", "off", "B sees A's mic off at start");

  await a.getByTestId("mic").click();
  await a.waitForFunction(() => document.querySelector('[data-testid="mic"]').dataset.state === "live");
  await partnerMic(b, "data-state", "live", "A turns mic on -> B sees it live");
  await partnerMic(b, "data-speaking", "true", "B detects A's voice (real audio over the relay)");
  const f = await voiceFlowing(b);
  assert(f.tracks === 1 && f.advancing && !f.paused, "B's voice <audio> is playing A's track");
  await a.waitForFunction(() => document.querySelector('[data-testid="mic"]').dataset.speaking === "true", null, { timeout: 5000 });
  assert(true, "A's own mic button shows speaking");
  await b.waitForTimeout(800);
  if (SHOTS) { await b.screenshot({ path: `${SHOTS}/v1-partner-talking.png` }); await a.screenshot({ path: `${SHOTS}/v2-mic-live.png` }); }

  await a.keyboard.press("v");
  await partnerMic(b, "data-state", "muted", "V key mutes -> B sees muted");
  await partnerMic(b, "data-speaking", "false", "B no longer detects speech");
  if (SHOTS) await a.screenshot({ path: `${SHOTS}/v3-mic-muted.png` });
  await a.keyboard.press("v");
  await partnerMic(b, "data-speaking", "true", "unmute -> B hears A again");

  await a.getByTestId("share").click();
  await b.waitForFunction(() => { const v = document.querySelector("video"); return v && v.videoWidth > 0 && v.currentTime > 0.5; }, null, { timeout: 15000 });
  const tracks = await b.evaluate(() => ({ screen: document.querySelector("video").srcObject.getTracks().length, voice: document.querySelector('[data-testid="remote-voice"]').srcObject.getAudioTracks().length }));
  assert(tracks.screen === 2 && tracks.voice === 1, "share + voice together: B gets screen (video+audio) and a separate voice track");
  await partnerMic(b, "data-speaking", "true", "voice still detected while A shares");

  await b.getByTestId("mic").click();
  await partnerMic(a, "data-state", "live", "B's mic on -> A sees it (both directions)");
  await partnerMic(a, "data-speaking", "true", "A hears B");

  await b.reload();
  await b.getByTestId("join").click();
  await b.getByTestId("phase").filter({ hasText: "connected" }).waitFor({ timeout: 20000 });
  await partnerMic(b, "data-state", "live", "after B reloads, A's mic is re-attached on the new connection");
  await partnerMic(b, "data-speaking", "true", "B hears A again after the reload");
  await partnerMic(a, "data-state", "off", "A sees B's mic off after B's reload");
  console.log("VOICE E2E PASSED");
} catch (e) {
  console.error("VOICE E2E FAILED:", e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
