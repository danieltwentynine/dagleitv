import { $, Report, errorInfo } from '/js/report.js';
import { escapeHtml } from '/js/stats.js';

const report = new Report('camera');
const video = $('#video');
const status = $('#status');
let current = null;

const md = navigator.mediaDevices;
report.support('mediaDevices', !!md);
report.support('getUserMedia', !!md?.getUserMedia);
report.support('enumerateDevices', !!md?.enumerateDevices);
report.support('getSupportedConstraints', md?.getSupportedConstraints ? md.getSupportedConstraints() : null);
report.support('permissionsAPI', !!navigator.permissions?.query);

async function permissionStates() {
  const out = {};
  for (const name of ['camera', 'microphone']) {
    try {
      out[name] = (await navigator.permissions.query({ name })).state;
    } catch (err) {
      out[name] = `unsupported (${errorInfo(err).name})`;
    }
  }
  return out;
}

async function listDevices(when) {
  if (!md?.enumerateDevices) return [];
  try {
    const devices = await md.enumerateDevices();
    const list = devices.map((d) => ({ kind: d.kind, label: d.label || '(no label before permission)', deviceId: d.deviceId ? `${d.deviceId.slice(0, 8)}…` : '(empty)', groupId: d.groupId ? `${d.groupId.slice(0, 8)}…` : '' }));
    report.result(`enumerateDevices (${when})`, { ok: true, count: list.length, devices: list, permissions: navigator.permissions?.query ? await permissionStates() : 'n/a' });
    fillSelect($('#camera'), devices.filter((d) => d.kind === 'videoinput'));
    fillSelect($('#mic'), devices.filter((d) => d.kind === 'audioinput'));
    return devices;
  } catch (err) {
    report.error(`enumerateDevices (${when})`, err);
    return [];
  }
}

function fillSelect(select, devices) {
  const keep = select.value;
  select.innerHTML = '<option value="">default</option>';
  devices.forEach((d, i) => {
    const o = document.createElement('option');
    o.value = d.deviceId;
    o.textContent = d.label || `${d.kind} ${i + 1}`;
    select.append(o);
  });
  select.value = keep;
}

const TESTS = [
  ['video: true', { video: true }],
  ['audio: true', { audio: true }],
  ['audio + video', { audio: true, video: true }],
  ['ideal 640x480', { video: { width: { ideal: 640 }, height: { ideal: 480 } } }],
  ['ideal 1280x720', { video: { width: { ideal: 1280 }, height: { ideal: 720 } } }],
  ['ideal 1920x1080', { video: { width: { ideal: 1920 }, height: { ideal: 1080 } } }],
  ['ideal 3840x2160', { video: { width: { ideal: 3840 }, height: { ideal: 2160 } } }],
  ['exact 1920x1080', { video: { width: { exact: 1920 }, height: { exact: 1080 } } }],
  ['frameRate ideal 60', { video: { frameRate: { ideal: 60 } } }],
  ['frameRate exact 60', { video: { frameRate: { exact: 60 } } }],
  ['facingMode user', { video: { facingMode: 'user' } }],
  ['facingMode exact environment', { video: { facingMode: { exact: 'environment' } } }],
  ['audio processing off', { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }],
];

function describeTracks(stream) {
  return stream.getTracks().map((t) => ({
    kind: t.kind,
    label: t.label,
    settings: t.getSettings?.() ?? null,
    capabilities: t.getCapabilities ? safe(() => t.getCapabilities()) : 'getCapabilities unsupported',
    constraints: t.getConstraints?.() ?? null,
  }));
}

function safe(fn) {
  try {
    return fn();
  } catch (err) {
    return { error: errorInfo(err) };
  }
}

function stop() {
  current?.getTracks().forEach((t) => t.stop());
  current = null;
  video.srcObject = null;
}

async function attempt(name, constraints, { keep = false } = {}) {
  const row = document.createElement('tr');
  row.innerHTML = `<td>${escapeHtml(name)}</td><td class="muted">…</td><td></td>`;
  $('#attempts tbody').append(row);
  const t0 = performance.now();
  try {
    const stream = await md.getUserMedia(constraints);
    const tracks = describeTracks(stream);
    report.result(`getUserMedia: ${name}`, { ok: true, constraints, ms: Math.round(performance.now() - t0), tracks });
    const v = tracks.find((t) => t.kind === 'video')?.settings;
    row.children[1].innerHTML = '<span class="ok">ok</span>';
    row.children[2].textContent = v ? `${v.width}x${v.height} @${v.frameRate ?? '?'} ${v.facingMode ?? ''}` : 'audio';
    stream.getTracks().forEach((t) => t.addEventListener('ended', () => report.result('track ended', { kind: t.kind, label: t.label })));
    if (keep) {
      stop();
      current = stream;
      video.srcObject = stream;
    } else {
      stream.getTracks().forEach((t) => t.stop());
    }
    return true;
  } catch (err) {
    report.result(`getUserMedia: ${name}`, { ok: false, constraints, ms: Math.round(performance.now() - t0), error: errorInfo(err) });
    row.children[1].innerHTML = `<span class="bad">${escapeHtml(err.name)}</span>`;
    row.children[2].textContent = err.constraint ? `constraint: ${err.constraint}` : err.message;
    return false;
  }
}

$('#enumerate').addEventListener('click', () => void listDevices('on demand'));

$('#run-all').addEventListener('click', async () => {
  if (!md?.getUserMedia) return report.error('getUserMedia', { name: 'NotSupportedError', message: 'navigator.mediaDevices.getUserMedia is missing' });
  $('#run-all').disabled = true;
  stop();
  status.textContent = 'Running… allow the permission prompt to see the permission flow.';
  await listDevices('before permission');
  for (const [name, constraints] of TESTS) await attempt(name, constraints);
  await listDevices('after permission');
  status.textContent = 'Done. Copy the report below.';
  $('#run-all').disabled = false;
});

$('#preview').addEventListener('click', () => {
  const cam = $('#camera').value;
  const mic = $('#mic').value;
  void attempt('preview (selected devices)', {
    video: cam ? { deviceId: { exact: cam } } : true,
    audio: mic ? { deviceId: { exact: mic } } : true,
  }, { keep: true });
});

$('#stop').addEventListener('click', stop);
md?.addEventListener?.('devicechange', () => {
  report.result('devicechange event', {});
  void listDevices('after devicechange');
});
void listDevices('page load');
