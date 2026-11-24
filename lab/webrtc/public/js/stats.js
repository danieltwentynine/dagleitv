// getStats() summarizer: codec, resolution, fps, bitrate, packets lost, RTT and the
// selected candidate pair. Bitrate is computed from the previous sample.

export function createStatsSampler(pc) {
  let previous = new Map();
  return async function sample() {
    const report = await pc.getStats();
    const byId = new Map();
    report.forEach((s) => byId.set(s.id, s));
    const out = { at: new Date().toISOString(), outbound: [], inbound: [], candidatePair: null };

    const codecOf = (s) => {
      const c = s.codecId ? byId.get(s.codecId) : null;
      return c ? `${c.mimeType}${c.sdpFmtpLine ? ` (${c.sdpFmtpLine})` : ''}` : null;
    };
    const bitrate = (s, bytesKey) => {
      const prev = previous.get(s.id);
      if (!prev || s[bytesKey] === undefined) return null;
      const dt = (s.timestamp - prev.timestamp) / 1000;
      return dt > 0 ? Math.round(((s[bytesKey] - prev[bytesKey]) * 8) / dt / 1000) : null; // kbps
    };

    report.forEach((s) => {
      if (s.type === 'outbound-rtp') {
        out.outbound.push({
          kind: s.kind,
          codec: codecOf(s),
          resolution: s.frameWidth ? `${s.frameWidth}x${s.frameHeight}` : null,
          fps: s.framesPerSecond ?? null,
          kbps: bitrate(s, 'bytesSent'),
          packetsSent: s.packetsSent ?? null,
          qualityLimitationReason: s.qualityLimitationReason ?? null,
          encoderImplementation: s.encoderImplementation ?? null,
        });
      } else if (s.type === 'inbound-rtp') {
        out.inbound.push({
          kind: s.kind,
          codec: codecOf(s),
          resolution: s.frameWidth ? `${s.frameWidth}x${s.frameHeight}` : null,
          fps: s.framesPerSecond ?? null,
          kbps: bitrate(s, 'bytesReceived'),
          packetsLost: s.packetsLost ?? null,
          jitter: s.jitter ?? null,
          decoderImplementation: s.decoderImplementation ?? null,
        });
      } else if (s.type === 'remote-inbound-rtp' && s.roundTripTime !== undefined) {
        out.remoteRtt = { ...(out.remoteRtt ?? {}), [s.kind]: s.roundTripTime };
      }
    });

    // Selected candidate pair: via transport.selectedCandidatePairId, else the nominated succeeded pair.
    let pair = null;
    report.forEach((s) => {
      if (s.type === 'transport' && s.selectedCandidatePairId) pair = byId.get(s.selectedCandidatePairId);
    });
    if (!pair) report.forEach((s) => {
      if (!pair && s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded') pair = s;
    });
    if (pair) {
      const local = byId.get(pair.localCandidateId);
      const remote = byId.get(pair.remoteCandidateId);
      out.candidatePair = {
        local: local ? `${local.candidateType}/${local.protocol}${local.relayProtocol ? `/${local.relayProtocol}` : ''}` : null,
        remote: remote ? `${remote.candidateType}/${remote.protocol}` : null,
        rttMs: pair.currentRoundTripTime !== undefined ? Math.round(pair.currentRoundTripTime * 1000) : null,
        availableOutgoingKbps: pair.availableOutgoingBitrate ? Math.round(pair.availableOutgoingBitrate / 1000) : null,
      };
    }

    previous = new Map();
    report.forEach((s) => {
      if (s.type === 'outbound-rtp' || s.type === 'inbound-rtp') previous.set(s.id, s);
    });
    return out;
  };
}

/** Render a summary into a table element. */
export function renderStats(table, summary) {
  const rows = [];
  const fmt = (v) => (v === null || v === undefined ? '—' : String(v));
  for (const o of summary.outbound) rows.push(['send ' + o.kind, o.codec, o.resolution, o.fps, o.kbps, `sent ${fmt(o.packetsSent)}`, o.qualityLimitationReason]);
  for (const i of summary.inbound) rows.push(['recv ' + i.kind, i.codec, i.resolution, i.fps, i.kbps, `lost ${fmt(i.packetsLost)}`, i.decoderImplementation]);
  const pair = summary.candidatePair;
  table.innerHTML = `
    <thead><tr><th>stream</th><th>codec</th><th>resolution</th><th>fps</th><th>kbps</th><th>packets</th><th>notes</th></tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(fmt(c))}</td>`).join('')}</tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="7">pair: ${escapeHtml(pair ? `${pair.local} ↔ ${pair.remote}` : '—')} · RTT ${fmt(pair?.rttMs)} ms · available out ${fmt(pair?.availableOutgoingKbps)} kbps</td></tr></tfoot>`;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
