import { test } from "node:test";
import assert from "node:assert/strict";
import { detectBrowser, shareSupport } from "./browserSupport.ts";

const UA = {
  chromeWin: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  edgeWin: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0",
  chromeMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  safariMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15",
  firefoxLinux: "Mozilla/5.0 (X11; Linux x86_64; rv:150.0) Gecko/20100101 Firefox/150.0",
  ladybird: "Mozilla/5.0 (macOS; arm64) Ladybird/1.0",
  androidChrome: "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
};
const support = (ua, hasApi = true) => shareSupport(detectBrowser(ua), hasApi);

test("system audio is promised only for Chromium on Windows", () => {
  assert.equal(support(UA.chromeWin), "full");
  assert.equal(support(UA.edgeWin), "full");
  for (const ua of [UA.chromeMac, UA.safariMac, UA.firefoxLinux, UA.ladybird]) assert.equal(support(ua), "no-audio");
});

test("sharing depends on the API, not the device", () => {
  assert.equal(support(UA.androidChrome, true), "no-audio");
  assert.equal(support(UA.chromeWin, false), "none");
});
