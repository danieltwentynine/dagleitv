export type BrowserName = "chrome" | "edge" | "opera" | "firefox" | "safari" | "other";

export interface BrowserInfo {
  name: BrowserName;
  mobile: boolean;
}

/** Best-effort browser sniffing; only used to word advice, never to gate joining. */
export function detectBrowser(ua: string, maxTouchPoints = 0): BrowserInfo {
  // iPadOS reports a desktop Mac UA, so touch points give it away.
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
  let name: BrowserName = "other";
  if (/Edg(e|A|iOS)?\//.test(ua)) name = "edge";
  else if (/OPR\/|Opera/.test(ua)) name = "opera";
  else if (/Firefox\/|FxiOS\//.test(ua)) name = "firefox";
  else if (/Chrome\/|CriOS\//.test(ua)) name = "chrome";
  else if (/Safari\//.test(ua)) name = "safari";
  return { name, mobile };
}

export type ShareSupport =
  /** Can share the screen with system audio. */
  | "full"
  /** Can share the screen, but the browser can't capture system audio. */
  | "no-audio"
  /** Can't share at all (phones and tablets, or no getDisplayMedia). */
  | "none";

export function shareSupport(browser: BrowserInfo, hasGetDisplayMedia: boolean): ShareSupport {
  if (browser.mobile || !hasGetDisplayMedia) return "none";
  return browser.name === "chrome" || browser.name === "edge" || browser.name === "opera" ? "full" : "no-audio";
}

/** Reads the current browser. Client-only: call from an effect to avoid hydration mismatch. */
export function currentShareSupport(): { browser: BrowserInfo; support: ShareSupport } {
  const browser = detectBrowser(navigator.userAgent, navigator.maxTouchPoints);
  return { browser, support: shareSupport(browser, typeof navigator.mediaDevices?.getDisplayMedia === "function") };
}

export const NO_SHARE_MESSAGE =
  "This device can't share its screen. You can still watch and chat. To share, open this link on a computer using Chrome or Edge.";
export const NO_AUDIO_MESSAGE =
  "This browser can share the screen but not the sound. For movies with audio, use Chrome or Edge on a computer.";
