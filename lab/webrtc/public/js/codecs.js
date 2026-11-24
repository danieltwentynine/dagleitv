import { $, Report, errorInfo } from '/js/report.js';
import { syntheticStream } from '/js/media.js';
import { escapeHtml } from '/js/stats.js';

const report = new Report('codecs');

const hasSenderCaps = typeof RTCRtpSender !== 'undefined' && typeof RTCRtpSender.getCapabilities === 'function';
const hasReceiverCaps = typeof RTCRtpReceiver !== 'undefined' && typeof RTCRtpReceiver.getCapabilities === 'function';
const hasCodecPrefs = typeof RTCRtpTransceiver !== 'undefined' && 'setCodecPreferences' in RTCRtpTransceiver.prototype;
const hasMediaCaps = !!navigator.mediaCapabilities?.encodingInfo;
report.support('RTCRtpSender.getCapabilities', hasSenderCaps);
report.support('RTCRtpReceiver.getCapabilities', hasReceiverCaps);
report.support('RTCRtpTransceiver.setCodecPreferences', hasCodecPrefs);
report.support('navigator.mediaCapabilities', hasMediaCaps);

const isMedia = (c) => !/(rtx|red|ulpfec|flexfec|telephone-event|CN)$/i.test(c.mimeType);
const codecKey = (c) => `${c.mimeType} ${c.sdpFmtpLine ?? ''}`.trim();

function caps(kind) {
  const read = (cls) => {
    try {
      return cls.getCapabilities(kind);
    } catch (err) {
      return { error: errorInfo(err) };
    }
  };
  return { send: hasSenderCaps ? read(RTCRtpSender) : null, receive: hasReceiverCaps ? read(RTCRtpReceiver) : null };
}

function renderCaps(table, { send, receive }) {
  const all = new Map();
  for (const c of send?.codecs ?? []) all.set(codecKey(c), { c, send: true, recv: false });
  for (const c of receive?.codecs ?? []) {
    const k = codecKey(c);
    all.set(k, { c, send: all.get(k)?.send ?? false, recv: true });
  }
  table.innerHTML = `<thead><tr><th>codec</th><th>fmtp</th><th>send</th><th>recv</th></tr></thead><tbody>${[...all.values()]
    .map(({ c, send, recv }) => `<tr class="${isMedia(c) ? '' : 'muted'}"><td>${escapeHtml(c.mimeType)}</td><td>${escapeHtml(c.sdpFmtpLine ?? '')}</td><td>${send ? '✓' : ''}</td><td>${recv ? '✓' : ''}</td></tr>`)
    .join('')}</tbody>`;
}

// MediaCapabilities probes: "webrtc" type takes the RTP mime type (+ fmtp for H.264).
const MC_VIDEO = [
  ['VP8', 'video/VP8'],
  ['VP9', 'video/VP9'],
  ['H.264 constrained baseline', 'video/H264;level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f'],
  ['H.264 high', 'video/H264;level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=640c1f'],
  ['AV1', 'video/AV1'],
  ['H.265', 'video/H265'],
];
const MC_SIZES = [
  [1280, 720, 30, 2_500_000],
  [1920, 1080, 30, 5_000_000],
  [1920, 1080, 60, 8_000_000],
];

async function mediaCapabilities() {
  const rows = [];
  for (const [name, contentType] of MC_VIDEO) {
    for (const [width, height, framerate, bitrate] of MC_SIZES) {
      const video = { contentType, width, height, framerate, bitrate };
      const probe = async (fn) => {
        try {
          const r = await navigator.mediaCapabilities[fn]({ type: 'webrtc', video });
          return { supported: r.supported, smooth: r.smooth, powerEfficient: r.powerEfficient };
        } catch (err) {
          return { error: errorInfo(err) };
        }
      };
      rows.push({ codec: name, contentType, size: `${width}x${height}@${framerate}`, encode: await probe('encodingInfo'), decode: await probe('decodingInfo') });
    }
  }
  try {
    const opus = { contentType: 'audio/opus', channels: '2', bitrate: 64000, samplerate: 48000 };
    rows.push({ codec: 'Opus', contentType: 'audio/opus', size: 'stereo 64 kbps', encode: await navigator.mediaCapabilities.encodingInfo({ type: 'webrtc', audio: opus }).then(pick), decode: await navigator.mediaCapabilities.decodingInfo({ type: 'webrtc', audio: opus }).then(pick) });
  } catch (err) {
    rows.push({ codec: 'Opus', error: errorInfo(err) });
  }
  return rows;
}
const pick = (r) => ({ supported: r.supported, smooth: r.smooth, powerEfficient: r.powerEfficient });

function fmt(r) {
  if (!r) return '—';
  if (r.error) return `<span class="bad">${escapeHtml(r.error.name)}</span>`;
  return `${r.supported ? '<span class="ok">yes</span>' : '<span class="bad">no</span>'}${r.supported ? ` · smooth ${r.smooth ? 'y' : 'n'} · power ${r.powerEfficient ? 'y' : 'n'}` : ''}`;
}

$('#inspect').addEventListener('click', async () => {
  const video = caps('video');
  const audio = caps('audio');
  renderCaps($('#video-caps'), video);
  renderCaps($('#audio-caps'), audio);
  report.result('getCapabilities video', video);
  report.result('getCapabilities audio', audio);

  const select = $('#prefer');
  select.innerHTML = '<option value="">(browser default)</option>';
  for (const c of (video.send?.codecs ?? []).filter(isMedia)) {
    const o = document.createElement('option');
    o.value = codecKey(c);
    o.textContent = codecKey(c);
    select.append(o);
  }

  if (hasMediaCaps) {
    const rows = await mediaCapabilities();
    $('#mc').innerHTML = `<thead><tr><th>codec</th><th>size</th><th>encode</th><th>decode</th></tr></thead><tbody>${rows
      .map((r) => `<tr><td>${escapeHtml(r.codec)}</td><td>${escapeHtml(r.size ?? '')}</td><td>${fmt(r.encode)}</td><td>${fmt(r.decode)}</td></tr>`)
      .join('')}</tbody>`;
    report.result('MediaCapabilities webrtc', { rows });
  } else {
    $('#mc').innerHTML = '<tbody><tr><td class="bad">navigator.mediaCapabilities is not available</td></tr></tbody>';
  }
});

$('#loopback').addEventListener('click', async () => {
  const preferred = $('#prefer').value;
  let src;
  let a;
  let b;
  try {
    src = syntheticStream({ width: 1280, height: 720 });
    a = new RTCPeerConnection();
    b = new RTCPeerConnection();
    a.onicecandidate = (e) => e.candidate && b.addIceCandidate(e.candidate);
    b.onicecandidate = (e) => e.candidate && a.addIceCandidate(e.candidate);
    const transceiver = a.addTransceiver(src.stream.getVideoTracks()[0], { direction: 'sendonly', streams: [src.stream] });

    let preference = { requested: preferred || null, applied: false };
    if (preferred && hasCodecPrefs) {
      const codecs = RTCRtpSender.getCapabilities('video').codecs;
      const chosen = codecs.filter((c) => codecKey(c) === preferred);
      const rest = codecs.filter((c) => codecKey(c) !== preferred);
      try {
        transceiver.setCodecPreferences([...chosen, ...rest]);
        preference.applied = true;
      } catch (err) {
        preference.error = errorInfo(err);
      }
    } else if (preferred) {
      preference.error = { name: 'NotSupportedError', message: 'setCodecPreferences is not available' };
    }

    const offer = await a.createOffer();
    await a.setLocalDescription(offer);
    await b.setRemoteDescription(offer);
    const answer = await b.createAnswer();
    await b.setLocalDescription(answer);
    await a.setRemoteDescription(answer);

    $('#negotiated').textContent = 'Connected? waiting for media stats…';
    // Give the encoder a moment, then read the negotiated codec from both sides.
    let sent = null;
    let received = null;
    for (let i = 0; i < 20 && !(sent && received); i++) {
      await new Promise((r) => setTimeout(r, 500));
      sent = await negotiated(a, 'outbound-rtp');
      received = await negotiated(b, 'inbound-rtp');
    }
    const result = { preference, sent, received, connectionState: a.connectionState };
    report.result('loopback negotiated codec', result);
    $('#negotiated').textContent = sent
      ? `Sending ${sent.mimeType} ${sent.sdpFmtpLine ?? ''} (${sent.encoderImplementation ?? 'encoder ?'}) → receiving ${received?.mimeType ?? '?'} (${received?.decoderImplementation ?? 'decoder ?'})`
      : `No outbound-rtp codec reported (connection: ${a.connectionState}).`;
  } catch (err) {
    report.error('loopback', err);
    $('#negotiated').textContent = `${err.name}: ${err.message}`;
  } finally {
    a?.close();
    b?.close();
    src?.stop();
  }
});

async function negotiated(pc, type) {
  const stats = await pc.getStats();
  let out = null;
  stats.forEach((s) => {
    if (s.type === type && s.kind === 'video' && s.codecId) {
      const codec = stats.get(s.codecId);
      if (codec) {
        out = {
          mimeType: codec.mimeType,
          payloadType: codec.payloadType,
          sdpFmtpLine: codec.sdpFmtpLine,
          encoderImplementation: s.encoderImplementation,
          decoderImplementation: s.decoderImplementation,
          powerEfficientEncoder: s.powerEfficientEncoder,
          powerEfficientDecoder: s.powerEfficientDecoder,
        };
      }
    }
  });
  return out;
}
