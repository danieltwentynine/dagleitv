// ICE server form + candidate parsing shared by the P2P and streaming pages.
// Default: public Google STUN only. TURN is optional and never hardcoded.

export const DEFAULT_STUN = 'stun:stun.l.google.com:19302';

/** Renders the editable ICE config into `container` and returns a getter. */
export function iceForm(container) {
  container.innerHTML = `
    <fieldset class="ice">
      <legend>ICE servers</legend>
      <label>STUN URLs (one per line)<textarea name="stun" rows="2">${DEFAULT_STUN}</textarea></label>
      <label>TURN URL (optional)<input name="turnUrl" placeholder="turn:turn.example.com:3478?transport=udp"></label>
      <label>TURN username<input name="turnUser" autocomplete="off"></label>
      <label>TURN credential<input name="turnCred" type="password" autocomplete="off"></label>
      <label>ICE transport policy
        <select name="policy"><option value="all">all</option><option value="relay">relay (TURN only)</option></select>
      </label>
    </fieldset>`;
  const field = (n) => container.querySelector(`[name="${n}"]`);
  return function config() {
    const iceServers = [];
    const stun = field('stun').value.split('\n').map((s) => s.trim()).filter(Boolean);
    if (stun.length) iceServers.push({ urls: stun });
    const turn = field('turnUrl').value.trim();
    if (turn) iceServers.push({ urls: turn, username: field('turnUser').value, credential: field('turnCred').value });
    return { iceServers, iceTransportPolicy: field('policy').value };
  };
}

/** The config as it may appear in a report (TURN credential redacted). */
export function redactConfig(config) {
  return {
    ...config,
    iceServers: config.iceServers.map((s) => (s.credential ? { ...s, credential: '(redacted)' } : s)),
  };
}

/** Parse an RTCIceCandidate (or its init) into the fields worth reporting. */
export function describeCandidate(c) {
  const line = c.candidate ?? '';
  if (!line) return { endOfCandidates: true };
  const parts = line.split(' ');
  const typIdx = parts.indexOf('typ');
  const address = c.address ?? parts[4];
  return {
    type: c.type ?? (typIdx > -1 ? parts[typIdx + 1] : 'unknown'), // host | srflx | prflx | relay
    protocol: c.protocol ?? parts[2]?.toLowerCase(),
    address,
    port: c.port ?? Number(parts[5]),
    mdns: typeof address === 'string' && address.endsWith('.local'),
    relayProtocol: c.relayProtocol ?? null,
    raw: line,
  };
}

/** Count candidates by type, plus how many are mDNS-obfuscated hosts. */
export function countCandidates(list) {
  const counts = { host: 0, srflx: 0, prflx: 0, relay: 0, mdns: 0 };
  for (const c of list) {
    if (c.endOfCandidates) continue;
    counts[c.type] = (counts[c.type] ?? 0) + 1;
    if (c.mdns) counts.mdns++;
  }
  return counts;
}

/** Resolves when ICE gathering completes (for copy/paste, non-trickle SDP). */
export function gatheringComplete(pc, timeoutMs = 10_000) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve(true);
  return new Promise((resolve) => {
    const done = () => {
      if (pc.iceGatheringState !== 'complete') return;
      pc.removeEventListener('icegatheringstatechange', done);
      resolve(true);
    };
    pc.addEventListener('icegatheringstatechange', done);
    setTimeout(() => resolve(false), timeoutMs);
  });
}
