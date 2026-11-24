import { $, Report, errorInfo, logLine } from '/js/report.js';
import { countCandidates, describeCandidate, gatheringComplete, iceForm, redactConfig } from '/js/ice.js';
import { getSource } from '/js/media.js';
import { escapeHtml } from '/js/stats.js';

const report = new Report('p2p');
const iceConfig = iceForm($('#ice'));
const timeline = $('#timeline');
const candidates = { loopA: [], loopB: [], manual: [] };

report.support('RTCPeerConnection', typeof RTCPeerConnection === 'function');
report.support('RTCDataChannel', typeof RTCDataChannel === 'function');
report.support('canvas.captureStream', typeof HTMLCanvasElement !== 'undefined' && 'captureStream' in HTMLCanvasElement.prototype);

/** Instrument a peer connection: candidates + state timeline. */
function watch(pc, label) {
  const t0 = performance.now();
  const at = () => `+${Math.round(performance.now() - t0)}ms`;
  const states = [];
  const note = (what, value) => {
    states.push({ t: at(), [what]: value });
    logLine(timeline, `${label} ${at()} ${what}=${value}`);
  };
  pc.addEventListener('signalingstatechange', () => note('signaling', pc.signalingState));
  pc.addEventListener('icegatheringstatechange', () => note('iceGathering', pc.iceGatheringState));
  pc.addEventListener('iceconnectionstatechange', () => note('iceConnection', pc.iceConnectionState));
  pc.addEventListener('connectionstatechange', () => {
    note('connection', pc.connectionState);
    if (pc.connectionState === 'connected' || pc.connectionState === 'failed') {
      report.result(`${label} ${pc.connectionState}`, { states, candidates: countCandidates(candidates[label] ?? []) });
    }
  });
  pc.addEventListener('icecandidateerror', (e) => {
    report.result(`${label} icecandidateerror`, { url: e.url, errorCode: e.errorCode, errorText: e.errorText, address: e.address, port: e.port });
  });
  pc.addEventListener('icecandidate', (e) => {
    if (!e.candidate) return note('candidate', 'end-of-candidates');
    const c = describeCandidate(e.candidate);
    (candidates[label] ??= []).push(c);
    const row = document.createElement('tr');
    row.innerHTML = `<td>${label}</td><td>${escapeHtml(c.type)}</td><td>${escapeHtml(c.protocol ?? '')}</td><td>${escapeHtml(c.address ?? '')}:${c.port ?? ''}</td><td>${c.mdns ? 'yes' : ''}</td>`;
    $('#cands tbody').append(row);
  });
  return states;
}

// ---- (a) loopback ----
let loop = null;

$('#loop-start').addEventListener('click', async () => {
  hangUpLoop();
  candidates.loopA = [];
  candidates.loopB = [];
  const config = iceConfig();
  try {
    const source = await getSource($('#loop-source').value);
    const a = new RTCPeerConnection(config);
    const b = new RTCPeerConnection(config);
    loop = { a, b, source };
    watch(a, 'loopA');
    watch(b, 'loopB');
    a.addEventListener('icecandidate', (e) => e.candidate && b.addIceCandidate(e.candidate).catch((err) => report.error('loopB addIceCandidate', err)));
    b.addEventListener('icecandidate', (e) => e.candidate && a.addIceCandidate(e.candidate).catch((err) => report.error('loopA addIceCandidate', err)));
    b.addEventListener('track', (e) => {
      $('#loop-remote').srcObject = e.streams[0] ?? new MediaStream([e.track]);
    });
    $('#loop-local').srcObject = source.stream;
    source.stream.getTracks().forEach((t) => a.addTrack(t, source.stream));

    const offer = await a.createOffer();
    await a.setLocalDescription(offer);
    await b.setRemoteDescription(offer);
    const answer = await b.createAnswer();
    await b.setLocalDescription(answer);
    await a.setRemoteDescription(answer);
    report.result('loopback negotiated', { config: redactConfig(config), source: $('#loop-source').value, offerSdp: offer.sdp, answerSdp: answer.sdp });
  } catch (err) {
    report.error('loopback', err);
  }
});

function hangUpLoop() {
  if (!loop) return;
  loop.a.close();
  loop.b.close();
  loop.source.stop();
  loop = null;
}
$('#loop-stop').addEventListener('click', hangUpLoop);

// ---- (b) manual copy/paste ----
let manual = null;

async function newManualPeer() {
  closeManual();
  candidates.manual = [];
  const config = iceConfig();
  const pc = new RTCPeerConnection(config);
  manual = { pc, source: null, channel: null, config };
  watch(pc, 'manual');
  pc.addEventListener('track', (e) => {
    $('#manual-remote').srcObject = e.streams[0] ?? new MediaStream([e.track]);
  });
  pc.addEventListener('datachannel', (e) => useChannel(e.channel));
  const kind = $('#manual-source').value;
  if (kind !== 'none') {
    manual.source = await getSource(kind);
    $('#manual-local').srcObject = manual.source.stream;
    manual.source.stream.getTracks().forEach((t) => pc.addTrack(t, manual.source.stream));
  }
  return pc;
}

function useChannel(channel) {
  manual.channel = channel;
  channel.addEventListener('open', () => {
    logLine(timeline, 'manual datachannel open');
    report.result('manual datachannel open', { label: channel.label });
  });
  channel.addEventListener('message', (e) => {
    logLine(timeline, `manual datachannel message: ${e.data}`);
    if (String(e.data).startsWith('ping')) channel.send(`pong ${new Date().toISOString()}`);
    else report.result('manual datachannel round trip', { message: String(e.data) });
  });
}

/** Non-trickle: wait for ICE gathering so the SDP carries every candidate. */
async function publishLocal(pc, label) {
  const complete = await gatheringComplete(pc);
  const sdp = pc.localDescription;
  $('#local-sdp').value = JSON.stringify(sdp);
  report.result(`manual ${label}`, { gatheringComplete: complete, config: redactConfig(manual.config), sdp: sdp.sdp });
}

$('#make-offer').addEventListener('click', async () => {
  try {
    const pc = await newManualPeer();
    useChannel(pc.createDataChannel('lab'));
    await pc.setLocalDescription(await pc.createOffer());
    await publishLocal(pc, 'offer');
  } catch (err) {
    report.error('manual create offer', err);
  }
});

function pastedDescription() {
  const text = $('#remote-sdp').value.trim();
  if (!text) throw Object.assign(new Error('Paste the other side\'s SDP first'), { name: 'InputError' });
  try {
    return JSON.parse(text);
  } catch {
    // Raw SDP pasted instead of JSON: guess the type from who is asking.
    return null;
  }
}

$('#make-answer').addEventListener('click', async () => {
  try {
    const desc = pastedDescription() ?? { type: 'offer', sdp: $('#remote-sdp').value.trim() + '\r\n' };
    const pc = await newManualPeer();
    await pc.setRemoteDescription(desc);
    await pc.setLocalDescription(await pc.createAnswer());
    await publishLocal(pc, 'answer');
  } catch (err) {
    report.error('manual create answer', err);
  }
});

$('#apply-answer').addEventListener('click', async () => {
  try {
    if (!manual?.pc) throw Object.assign(new Error('Create the offer in this tab first'), { name: 'InvalidStateError' });
    const desc = pastedDescription() ?? { type: 'answer', sdp: $('#remote-sdp').value.trim() + '\r\n' };
    await manual.pc.setRemoteDescription(desc);
    report.result('manual answer applied', { remoteSdp: desc.sdp });
  } catch (err) {
    report.error('manual apply answer', err);
  }
});

$('#manual-ping').addEventListener('click', () => {
  if (manual?.channel?.readyState === 'open') manual.channel.send(`ping ${new Date().toISOString()}`);
  else report.error('manual ping', { name: 'InvalidStateError', message: 'data channel is not open yet' });
});

function closeManual() {
  if (!manual) return;
  manual.pc.close();
  manual.source?.stop();
  manual = null;
}
$('#manual-stop').addEventListener('click', closeManual);

window.addEventListener('error', (e) => report.error('uncaught', errorInfo(e.error ?? e)));
