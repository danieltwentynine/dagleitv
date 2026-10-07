import { ICE_PATH, type IceServersResponse } from "@dagleitv/protocol";

export const FALLBACK_ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

export interface FetchedIce {
  iceServers: RTCIceServer[];
  /** True if the server included TURN relay credentials. */
  turn: boolean;
}

/**
 * Asks the signaling server for ICE servers. The caller must already be in the
 * room: the server refuses rooms with nobody in them. Never throws; on any
 * failure it falls back to public STUN so direct connections still work.
 */
export async function fetchIceServers(signalingUrl: string, roomId: string): Promise<FetchedIce> {
  try {
    const url = new URL(ICE_PATH, signalingUrl);
    url.searchParams.set("room", roomId);
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`/ice returned ${res.status}`);
    const body = (await res.json()) as IceServersResponse;
    return { iceServers: body.iceServers, turn: body.turn };
  } catch (e) {
    console.warn("Could not fetch ICE servers, using STUN only:", e);
    return { iceServers: FALLBACK_ICE_SERVERS, turn: false };
  }
}
