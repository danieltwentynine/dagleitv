export type BrowserName = "chrome" | "edge" | "opera" | "firefox" | "safari" | "other";

export interface BrowserInfo {
  name: BrowserName;
  mobile: boolean;
  /** Windows or ChromeOS: where screen sharing with system audio is known to work in Chromium. */
  systemAudioOs: boolean;
}

/** Best-effort browser sniffing; only used to word advice, never to gate joining or sharing. */
export function detectBrowser(ua: string, maxTouchPoints = 0): BrowserInfo {
  // iPadOS reports a desktop Mac UA, so touch points give it away.
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
  let name: BrowserName = "other";
  if (/Edg(e|A|iOS)?\//.test(ua)) name = "edge";
  else if (/OPR\/|Opera/.test(ua)) name = "opera";
  else if (/Firefox\/|FxiOS\//.test(ua)) name = "firefox";
  else if (/Chrome\/|CriOS\//.test(ua)) name = "chrome";
  else if (/Safari\//.test(ua)) name = "safari";
  return { name, mobile, systemAudioOs: /Windows|CrOS/.test(ua) };
}

export type ShareSupport =
  /** Can share, and system audio is known to work here (Chromium on Windows/ChromeOS). */
  | "full"
  /** Can share, but system audio is unknown or unavailable. What the capture returns decides. */
  | "no-audio"
  /** No getDisplayMedia: this browser can't share at all. */
  | "none";

/** Whether sharing is possible comes from the API alone; the browser name only words the audio advice. */
export function shareSupport(browser: BrowserInfo, hasGetDisplayMedia: boolean): ShareSupport {
  if (!hasGetDisplayMedia) return "none";
  const chromium = browser.name === "chrome" || browser.name === "edge" || browser.name === "opera";
  return chromium && browser.systemAudioOs ? "full" : "no-audio";
}

/** Reads the current browser. Client-only: call from an effect to avoid hydration mismatch. */
export function currentShareSupport(): { browser: BrowserInfo; support: ShareSupport } {
  const browser = detectBrowser(navigator.userAgent, navigator.maxTouchPoints);
  return { browser, support: shareSupport(browser, typeof navigator.mediaDevices?.getDisplayMedia === "function") };
}

export const NO_SHARE_MESSAGE =
  "This browser can't share its screen. You can still watch and chat. To share, open this link on a computer using Chrome or Edge.";
export const NO_AUDIO_MESSAGE =
  "This browser can share the screen, but it may not send the sound. If your partner can't hear the movie, share from Chrome or Edge on Windows.";
