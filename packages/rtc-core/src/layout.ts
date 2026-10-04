/**
 * Fixed transceiver layout shared by both peers. The offerer creates the
 * transceivers in this order; the answerer maps incoming ones by position
 * (getTransceivers() order == m-line order), never by guessing from tracks.
 */
export const TRANSCEIVER_ORDER = ["screen-video", "screen-audio", "voice"] as const;
export type TransceiverSlot = (typeof TRANSCEIVER_ORDER)[number];
