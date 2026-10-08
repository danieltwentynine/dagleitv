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
  p.on("dialog", (d) => void d.accept());
  await p.goto(url);
  return p;
};
const playing = (viewer) =>
  viewer.waitForFunction(() => {
    const v = document.querySelector("video");
    return v && v.videoWidth > 0 && v.currentTime > 0.5;
  }, null, { timeout: 15000 });

try {
  const icon = await fetch(`${WEB}/icon.svg`);
  assert(icon.ok && (icon.headers.get("content-type") ?? "").includes("svg"), "favicon served at /icon.svg");

  const home = await open(WEB);
  await home.getByRole("button", { name: "Create room" }).waitFor();
  await shot(home, "1-home");
  const theme = () => home.evaluate(() => ({
    attr: document.documentElement.dataset.theme ?? null,
    bg: getComputedStyle(document.body).backgroundColor,
  }));
  const before = await theme();
  await home.getByTestId("theme-toggle").click();
  const after = await theme();
  assert(after.attr && after.bg !== before.bg, `theme toggle switches to ${after.attr}`);
  await shot(home, "1b-home-toggled");
  await home.reload();
  assert((await theme()).attr === after.attr, "theme choice survives a reload (no flash: set before paint)");
  await home.getByTestId("theme-toggle").click();
  await home.evaluate(() => localStorage.removeItem("dagleitv.theme"));
  await home.getByLabel("Room code or link").fill("nope");
  await home.getByRole("button", { name: "Join", exact: true }).click();
  await home.getByText("not a room code").waitFor();
  assert(true, "home rejects a bad code");
  await home.getByLabel("Room code or link").fill(`${WEB}/room/pastedroom123?relay=1`);
  await home.getByRole("button", { name: "Join", exact: true }).click();
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
  await a.getByText("Nobody is sharing").waitFor();
  await shot(a, "4-connected");
  assert((await a.title()).startsWith("Connected"), "tab title shows Connected");
  assert(await a.locator("header a").count() === 0, "room logo is not a link");

  const c = await open(`${WEB}/room/${room}`);
  await c.getByTestId("join").click();
  await c.getByText("Room is full").waitFor({ timeout: 5000 });
  assert(true, "third peer rejected");
  await c.close();

  await a.getByTestId("share").click();
  await b.getByTestId("remote-sharing").filter({ hasText: "partner is sharing" }).waitFor({ timeout: 10000 });
  await playing(b);
  assert(true, "A shares -> B plays it");
  assert((await b.title()).startsWith("▶ Watching") && (await a.title()).startsWith("● Sharing"), "tab titles show Watching / Sharing");
  assert(await b.getByText("Click to play").count() === 0, "no stray Click to play while video plays");
  assert(await b.getByTestId("share").isDisabled(), "B's share button disabled while A shares");
  await shot(b, "5-watching");
  await shot(a, "6-sharing");

  assert((await b.getByTestId("signal").getAttribute("data-quality")) === "good", "signal indicator shows Good");

  // Chat is docked open by default. A hides it, B sends, A sees the unread badge.
  await a.getByTestId("chat-toggle").click();
  await b.getByTestId("chat-input").fill("hello from B");
  await b.getByTestId("chat-input").press("Enter");
  await a.getByTestId("chat-unread").waitFor({ timeout: 5000 });
  assert(true, "A gets an unread badge for B's message");
  await a.getByTestId("chat-toggle").click();
  await a.getByTestId("chat-list").getByText("hello from B").waitFor();
  assert(await b.getByTestId("chat-list").getByText("hello from B").count() === 1, "B sees own message once");
  await shot(a, "7-chat");

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

  // B is sharing: Leave asks first. Stay keeps the room; Leave goes home.
  await b.getByTestId("leave").click();
  await b.getByTestId("leave-dialog").waitFor();
  await shot(b, "10-leave-dialog");
  await b.getByRole("button", { name: "Stay" }).click();
  await b.getByTestId("leave-dialog").waitFor({ state: "hidden" });
  assert(await b.getByTestId("stop-share").isVisible(), "Stay keeps B in the room, still sharing");
  await b.getByTestId("leave").click();
  await b.getByTestId("confirm-leave").click();
  await b.waitForURL(`${WEB}/`);
  assert(true, "Leave (confirmed) takes B to the home page");
  await a.getByText("Waiting for your partner").waitFor({ timeout: 10000 });
  assert(true, "A returns to waiting when B leaves");
  assert((await a.title()).startsWith("Waiting for partner"), "A's tab title shows Waiting for partner");

  // Nothing live: Leave goes straight home without asking.
  await a.getByTestId("leave").click();
  await a.waitForURL(`${WEB}/`);
  assert(true, "Leave with nothing live goes home without a dialog");

  const m = await open(WEB, { width: 390, height: 844 });
  await shot(m, "9-mobile-home");

  // Light theme screenshots of the room.
  const la = await open(`${WEB}/room/${room}l?fake=1`);
  await la.evaluate(() => localStorage.setItem("dagleitv.theme", "light"));
  await la.reload();
  await shot(la, "11-light-enter");
  await la.getByTestId("join").click();
  const lb = await open(`${WEB}/room/${room}l?fake=1`);
  await lb.getByTestId("join").click();
  await la.getByTestId("phase").filter({ hasText: "connected" }).waitFor({ timeout: 20000 });
  await shot(la, "12-light-connected");
  await lb.getByTestId("share").click();
  await playing(la);
  await la.waitForTimeout(1000);
  await shot(la, "13-light-watching");
  console.log("UI E2E PASSED");
} catch (e) {
  console.error("UI E2E FAILED:", e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
