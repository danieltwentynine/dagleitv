// UI flow check against already-running dev servers (pnpm dev:signaling + pnpm dev:web).
// Usage: pnpm e2e:ui   (CHROMIUM_PATH overrides the browser; SHOTS=<dir> saves screenshots)
import { chromium } from "playwright-core";

const WEB = process.env.WEB_URL ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS;
const CHROME = process.env.CHROMIUM_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const assert = (c, m) => { if (!c) throw new Error("ASSERT: " + m); console.log("ok -", m); };

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ["--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream"],
});
const shot = (p, n) => (SHOTS ? p.screenshot({ path: `${SHOTS}/${n}.png` }) : undefined);
const open = async (url, viewport = { width: 1280, height: 800 }) => {
  const p = await (await browser.newContext({ viewport })).newPage();
  p.on("pageerror", (e) => console.log("pageerror:", e.message));
  await p.goto(url);
  return p;
};
const playing = (viewer) =>
  viewer.waitForFunction(() => {
    const v = document.querySelector("video");
    return v && v.videoWidth > 0 && v.currentTime > 0.5;
  }, null, { timeout: 15000 });

try {
  const home = await open(WEB);
  await home.getByText("Start a room").waitFor();
  await shot(home, "1-home");
  await home.getByLabel("Room link or code").fill("nope");
  await home.getByLabel("Join room").click();
  await home.getByText("doesn't look like").waitFor();
  assert(true, "home rejects a bad code");
  await home.getByLabel("Room link or code").fill(`${WEB}/room/pastedroom123?relay=1`);
  await home.getByLabel("Join room").click();
  await home.waitForURL(/\/room\/pastedroom123$/);
  assert(true, "home accepts a pasted link");

  const room = "uicheck" + Math.random().toString(36).slice(2, 8);
  const a = await open(`${WEB}/room/${room}?fake=1`);
  await shot(a, "2-enter");
  await a.getByTestId("join").click();
  await a.getByText("Waiting for your partner").waitFor({ timeout: 10000 });
  await shot(a, "3-waiting");

  const b = await open(`${WEB}/room/${room}?fake=1&relay=1`);
  await b.getByTestId("join").click();
  for (const p of [a, b]) await p.getByTestId("phase").filter({ hasText: "connected" }).waitFor({ timeout: 20000 });
  assert(true, "both peers connected (B forced relay)");
  await a.getByText("You're connected").waitFor();
  await shot(a, "4-connected");

  const c = await open(`${WEB}/room/${room}`);
  await c.getByTestId("join").click();
  await c.getByText("Room is full").waitFor({ timeout: 5000 });
  assert(true, "third peer rejected");
  await c.close();

  await a.getByTestId("share").click();
  await b.getByTestId("remote-sharing").filter({ hasText: "partner is sharing" }).waitFor({ timeout: 10000 });
  await playing(b);
  assert(true, "A shares -> B plays it");
  assert(await b.getByText("Click to play").count() === 0, "no stray Click to play while video plays");
  assert(await b.getByTestId("share").isDisabled(), "B's share button disabled while A shares");
  await shot(b, "5-watching");
  await shot(a, "6-sharing");

  await b.getByRole("button", { name: "Connection stats" }).click();
  assert(/RELAYED/.test(await b.getByTestId("net").innerText()), "stats drawer shows relayed pair");
  await shot(b, "7-stats");
  await b.getByRole("button", { name: "Close stats" }).click();

  await b.getByRole("button", { name: "Mute movie" }).click();
  assert(await b.evaluate(() => document.querySelector("video").muted), "movie mute mutes the video");
  await b.getByRole("button", { name: "Unmute movie" }).click();

  await b.keyboard.press("f");
  await b.waitForTimeout(500);
  assert(await b.evaluate(() => !!document.fullscreenElement), "F enters fullscreen");
  await b.waitForTimeout(3500);
  await shot(b, "8-fullscreen-idle");
  await b.keyboard.press("f");

  await a.getByTestId("stop-share").click();
  await b.waitForFunction(() => document.querySelector('[data-testid="remote-sharing"]').textContent === "", null, { timeout: 5000 });
  assert(true, "B sees A stop sharing");
  await b.getByTestId("share").click();
  await playing(a);
  assert(true, "B shares -> A plays it");

  await b.close();
  await a.getByText("Waiting for your partner").waitFor({ timeout: 10000 });
  assert(true, "A returns to waiting when B leaves");

  const m = await open(WEB, { width: 390, height: 844 });
  await shot(m, "9-mobile-home");
  console.log("UI E2E PASSED");
} catch (e) {
  console.error("UI E2E FAILED:", e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
