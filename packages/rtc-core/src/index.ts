/**
 * Framework-agnostic WebRTC core. No React/Next imports here, so it can be
 * reused as-is in an Electron renderer.
 */
import type { SignalMessage } from "@dagleitv/protocol";

/** Transport abstraction so the core doesn't depend on Socket.IO directly. */
export interface SignalingTransport {
  send(msg: SignalMessage): void;
  onMessage(handler: (msg: SignalMessage) => void): () => void;
}

/**
 * Fixed transceiver layout shared by both peers (see plan §1):
 * order matters, mids are matched by position.
 */
export const TRANSCEIVER_ORDER = ["screen-video", "screen-audio", "voice"] as const;
export type TransceiverSlot = (typeof TRANSCEIVER_ORDER)[number];
