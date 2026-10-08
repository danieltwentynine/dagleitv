export type CandidateType = "host" | "srflx" | "prflx" | "relay" | "unknown";

export interface ConnectionSnapshot {
  /** Selected candidate pair, as local/remote types, e.g. "relay/srflx". */
  pair: string | null;
  localType: CandidateType;
  remoteType: CandidateType;
  /** True if either side of the selected pair goes through a TURN relay. */
  relayed: boolean;
  protocol: string | null;
  rttMs: number | null;
  availableOutgoingKbps: number | null;
  /** Cumulative bytes on the selected pair; diff two snapshots for throughput. */
  bytesSent: number;
  bytesReceived: number;
  timestamp: number;
}

const asType = (v: unknown): CandidateType =>
  v === "host" || v === "srflx" || v === "prflx" || v === "relay" ? v : "unknown";

/** Reads the currently selected ICE candidate pair. Null until one is selected. */
export async function getConnectionSnapshot(pc: RTCPeerConnection): Promise<ConnectionSnapshot | null> {
  const report = await pc.getStats();
  let pairId: string | undefined;
  report.forEach((s) => {
    if (s.type === "transport" && s.selectedCandidatePairId) pairId = s.selectedCandidatePairId;
  });
  let pair: any = pairId ? report.get(pairId) : undefined;
  // Firefox has no transport.selectedCandidatePairId; fall back to the nominated pair.
  if (!pair) report.forEach((s) => { if (s.type === "candidate-pair" && s.nominated && s.state === "succeeded") pair = s; });
  if (!pair) return null;

  const local: any = report.get(pair.localCandidateId);
  const remote: any = report.get(pair.remoteCandidateId);
  const localType = asType(local?.candidateType);
  const remoteType = asType(remote?.candidateType);
  return {
    pair: `${localType}/${remoteType}`,
    localType,
    remoteType,
    relayed: localType === "relay" || remoteType === "relay",
    protocol: local?.protocol ?? null,
    rttMs: typeof pair.currentRoundTripTime === "number" ? pair.currentRoundTripTime * 1000 : null,
    availableOutgoingKbps:
      typeof pair.availableOutgoingBitrate === "number" ? pair.availableOutgoingBitrate / 1000 : null,
    bytesSent: pair.bytesSent ?? 0,
    bytesReceived: pair.bytesReceived ?? 0,
    timestamp: pair.timestamp ?? performance.now(),
  };
}

export interface Throughput {
  sendKbps: number;
  recvKbps: number;
}

export function throughputBetween(prev: ConnectionSnapshot, next: ConnectionSnapshot): Throughput | null {
  const dt = (next.timestamp - prev.timestamp) / 1000;
  if (dt <= 0) return null;
  return {
    sendKbps: ((next.bytesSent - prev.bytesSent) * 8) / dt / 1000,
    recvKbps: ((next.bytesReceived - prev.bytesReceived) * 8) / dt / 1000,
  };
}

export type SignalQuality = "good" | "weak" | "offline";

/** Round-trip time above which the link is called weak. */
const WEAK_RTT_MS = 250;

/**
 * Collapses connection state into one human label. `offline` means no working
 * link to the partner; `weak` means connected but slow enough to hurt calls.
 */
export function signalQuality(connected: boolean, snap: ConnectionSnapshot | null): SignalQuality {
  if (!connected) return "offline";
  if (snap?.rttMs != null && snap.rttMs > WEAK_RTT_MS) return "weak";
  return "good";
}
