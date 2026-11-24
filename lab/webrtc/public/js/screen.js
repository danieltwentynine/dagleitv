import { $, Report, errorInfo } from '/js/report.js';

const report = new Report('screen');
const video = $('#video');
const status = $('#status');
let current = null;

const md = navigator.mediaDevices;
const supported = !!md?.getDisplayMedia;
report.support('getDisplayMedia', supported);
report.support('CaptureController', typeof window.CaptureController === 'function');
report.support('supportedConstraints.displaySurface', !!md?.getSupportedConstraints?.().displaySurface);
report.support('isSecureContext', window.isSecureContext);

if (!supported) {
  const box = $('#unsupported');
  box.hidden = false;
  box.textContent = window.isSecureContext
    ? 'This browser has no navigator.mediaDevices.getDisplayMedia (expected on iOS/iPadOS and most mobile browsers). Screen capture is not available here.'
    : 'Not a secure context: getDisplayMedia is hidden. Open the lab on localhost or HTTPS.';
  report.result('feature detection', { ok: false, reason: box.textContent });
  $('#start').disabled = true;
}

function options() {
  const v = $('#video-opt').value;
  const a = $('#audio-opt').value;
  const opts = {
    video: v === 'hd' ? { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } } : v === 'hfr' ? { frameRate: { ideal: 60 } } : true,
    audio: a === 'true' ? true : a === 'noproc' ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false } : false,
  };
  const surface = $('#surface').value;
  if (surface) opts.video = { ...(opts.video === true ? {} : opts.video), displaySurface: surface };
  for (const key of ['systemAudio', 'selfBrowserSurface', 'surfaceSwitching', 'monitorTypeSurfaces']) {
    const value = $(`#${key}`).value;
    if (value) opts[key] = value;
  }
  if ($('#preferCurrentTab').value) opts.preferCurrentTab = true;
  return opts;
}

function stop() {
  current?.getTracks().forEach((t) => t.stop());
  current = null;
  video.srcObject = null;
}

$('#start').addEventListener('click', async () => {
  const opts = options();
  stop();
  status.textContent = 'Waiting for the browser picker…';
  const t0 = performance.now();
  try {
    const stream = await md.getDisplayMedia(opts);
    current = stream;
    video.srcObject = stream;
    const tracks = stream.getTracks().map((t) => ({
      kind: t.kind,
      label: t.label,
      settings: t.getSettings?.() ?? null,
      capabilities: t.getCapabilities ? (() => { try { return t.getCapabilities(); } catch (err) { return { error: errorInfo(err) }; } })() : 'unsupported',
      contentHint: t.contentHint,
    }));
    const vs = tracks.find((t) => t.kind === 'video')?.settings ?? {};
    report.result('getDisplayMedia', {
      ok: true,
      options: opts,
      ms: Math.round(performance.now() - t0),
      gotAudio: stream.getAudioTracks().length > 0,
      displaySurface: vs.displaySurface ?? '(not reported)',
      tracks,
    });
    status.textContent = `Capturing ${vs.displaySurface ?? 'surface'} ${vs.width ?? '?'}x${vs.height ?? '?'}${stream.getAudioTracks().length ? ' with audio' : ', no audio'}. Use the browser's "Stop sharing" to test the ended event.`;
    for (const t of stream.getTracks()) {
      t.addEventListener('ended', () => {
        report.result('track ended', { kind: t.kind, label: t.label, by: current === stream ? 'browser / user stopped sharing' : 'page' });
        status.textContent = 'Sharing ended.';
      });
    }
  } catch (err) {
    // NotAllowedError = user cancelled or blocked; NotSupportedError / TypeError = bad options; InvalidStateError = no user gesture.
    report.result('getDisplayMedia', { ok: false, options: opts, ms: Math.round(performance.now() - t0), error: errorInfo(err) });
    status.textContent = `${err.name}: ${err.message}`;
  }
});

$('#stop').addEventListener('click', () => {
  if (current) report.result('stopped by page', {});
  stop();
});
