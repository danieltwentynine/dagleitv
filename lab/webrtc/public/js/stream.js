import { $, Report, errorInfo, logLine } from '/js/report.js';
import { countCandidates, describeCandidate, iceForm, redactConfig } from '/js/ice.js';
import { getSource } from '/js/media.js';
import { connectSignaling } from '/js/signaling.js';
import { createStatsSampler, renderStats } from '/js/stats.js';

const report = new Report('stream');
const iceConfig = iceForm($('#ice'));
const timeline = $('#timeline');
const log = (t) => logLine(timeline, t);
if (!window.isSecureContext) $('#insecure').hidden = false;
report.support('EventSource', typeof EventSource === 'function');
report.support('RTCPeerConnection', typeof RTCPeerConnection === 'function');

/** peerId → { pc, pendingCandidates, sampler, table, timer, candidates } */
const peers = new Map();
let signaling = null;
let source = null;
let role = 'publisher';
let config = null;

function status(text) {
  $('#status').textContent = text;
}

function newPeer(peerId) {
  const pc = new RTCPeerConnection(config);
  const box = document.createElement('div');
  box.innerHTML = `<h3 class="muted">peer ${peerId.slice(0, 8)}</h3><table></table>`;
  $('#stats').append(box);
  const peer = { pc, pendingCandidates: [], candidates: [], sampler: createStatsSampler(pc), box, timer: null, samples: [] };
  peers.set(peerId, peer);

  pc.addEventListener('icecandidate', (e) => {
    if (e.candidate) {
      peer.candidates.push(describeCandidate(e.candidate));
      signaling.send('candidate', e.candidate.toJSON(), peerId).catch((err) => report.error('send candidate', err));
    }
  });
  pc.addEventListener('connectionstatechange', () => {
    log(`peer ${peerId.slice(0, 8)} connection=${pc.connectionState}`);
    if (pc.connectionState === 'connected') {
      report.result('connected', { peer: peerId, role, localCandidates: countCandidates(peer.candidates) });
      startStats(peerId, peer);
    }
    if (pc.connectionState === 'failed') report.result('connection failed', { peer: peerId, role, localCandidates: countCandidates(peer.candidates) });
  });
  pc.addEventListener('iceconnectionstatechange', () => log(`peer ${peerId.slice(0, 8)} ice=${pc.iceConnectionState}`));
  pc.addEventListener('track', (e) => {
    $('#remote').srcObject = e.streams[0] ?? new MediaStream([e.track]);
    log(`remote ${e.track.kind} track`);
  });
  return peer;
}

function startStats(peerId, peer) {
  clearInterval(peer.timer);
  peer.timer = setInterval(async () => {
    try {
      const s = await peer.sampler();
      renderStats(peer.box.querySelector('table'), s);
      peer.samples.push(s);
      if (peer.samples.length > 30) peer.samples.shift();
      report.set('latestStats', { ...(report.data.latestStats ?? {}), [peerId]: s });
    } catch (err) {
      report.error('getStats', err);
    }
  }, 1000);
}

function dropPeer(peerId) {
  const peer = peers.get(peerId);
  if (!peer) return;
  clearInterval(peer.timer);
  peer.pc.close();
  peer.box.remove();
  peers.delete(peerId);
}

async function offerTo(peerId) {
  const peer = newPeer(peerId);
  source.stream.getTracks().forEach((t) => peer.pc.addTrack(t, source.stream));
  const offer = await peer.pc.createOffer();
  await peer.pc.setLocalDescription(offer);
  await signaling.send('offer', peer.pc.localDescription.toJSON(), peerId);
  log(`offer → ${peerId.slice(0, 8)}`);
}

async function onSignal({ from, type, payload }) {
  try {
    if (type === 'offer' && role === 'viewer') {
      dropPeer(from);
      const peer = newPeer(from);
      await peer.pc.setRemoteDescription(payload);
      await flush(peer);
      await peer.pc.setLocalDescription(await peer.pc.createAnswer());
      await signaling.send('answer', peer.pc.localDescription.toJSON(), from);
      log(`answer → ${from.slice(0, 8)}`);
      report.result('offer received', { from, sdp: payload.sdp });
    } else if (type === 'answer') {
      const peer = peers.get(from);
      if (!peer) return;
      await peer.pc.setRemoteDescription(payload);
      await flush(peer);
      report.result('answer received', { from, sdp: payload.sdp });
    } else if (type === 'candidate') {
      const peer = peers.get(from);
      if (!peer) return;
      if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(payload);
      else peer.pendingCandidates.push(payload);
    } else if (type === 'bye') {
      dropPeer(from);
    }
  } catch (err) {
    report.error(`handle ${type}`, err);
  }
}

async function flush(peer) {
  for (const c of peer.pendingCandidates.splice(0)) {
    await peer.pc.addIceCandidate(c).catch((err) => report.error('addIceCandidate', err));
  }
}

$('#join').addEventListener('click', async () => {
  leave();
  role = $('#role').value;
  config = iceConfig();
  const room = $('#room').value.trim();
  report.set('session', { room, role, config: redactConfig(config), source: role === 'publisher' ? $('#source').value : null });
  try {
    if (role === 'publisher') {
      source = await getSource($('#source').value);
      $('#local').srcObject = source.stream;
      source.stream.getVideoTracks()[0]?.addEventListener('ended', () => log('local video track ended (sharing stopped?)'));
      report.result('local media', { ok: true, tracks: source.stream.getTracks().map((t) => ({ kind: t.kind, label: t.label, settings: t.getSettings?.() })) });
    }
  } catch (err) {
    report.result('local media', { ok: false, error: errorInfo(err) });
    status(`${err.name}: ${err.message}`);
    return;
  }
  signaling = connectSignaling({
    room,
    role,
    onWelcome: ({ id, peers: present }) => {
      status(`Joined room "${room}" as ${role} (${id.slice(0, 8)}). ${present.length} other peer(s).`);
      log(`welcome id=${id.slice(0, 8)} peers=${present.length}`);
      if (role === 'publisher') for (const p of present.filter((p) => p.role === 'viewer')) void offerTo(p.id).catch((err) => report.error('offer', err));
    },
    onPeerJoined: ({ id, role: theirs }) => {
      log(`peer joined ${id.slice(0, 8)} (${theirs})`);
      if (role === 'publisher' && theirs === 'viewer') void offerTo(id).catch((err) => report.error('offer', err));
    },
    onPeerLeft: ({ id }) => {
      log(`peer left ${id.slice(0, 8)}`);
      dropPeer(id);
    },
    onSignal: (msg) => void onSignal(msg),
    onError: (err) => {
      log(err.message);
      status(err.message);
    },
  });
});

function leave() {
  if (signaling?.id) void signaling.send('bye', {}).catch(() => undefined);
  signaling?.close();
  signaling = null;
  for (const id of [...peers.keys()]) dropPeer(id);
  source?.stop();
  source = null;
  $('#local').srcObject = null;
  $('#remote').srcObject = null;
  status('Not connected.');
}
$('#leave').addEventListener('click', leave);
window.addEventListener('pagehide', leave);
