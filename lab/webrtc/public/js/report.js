// Capability report shared by every lab page: collects results, renders them as
// JSON and copies them (userAgent, userAgentData, timestamp included).

/** Serialize any error so the report keeps its exact name. */
export function errorInfo(err) {
  if (!err) return null;
  const out = { name: err.name ?? 'Error', message: err.message ?? String(err) };
  if (err.constraint) out.constraint = err.constraint; // OverconstrainedError
  if (err.code !== undefined && typeof err.code !== 'object') out.code = err.code;
  return out;
}

async function uaData() {
  const d = navigator.userAgentData;
  if (!d) return null;
  const base = { brands: d.brands, mobile: d.mobile, platform: d.platform };
  try {
    const high = await d.getHighEntropyValues(['platformVersion', 'architecture', 'model', 'fullVersionList']);
    return { ...base, ...high };
  } catch (err) {
    return { ...base, highEntropyError: errorInfo(err) };
  }
}

export class Report {
  /** @param {string} experiment short id, e.g. "camera" */
  constructor(experiment, { output = '#report', copyButton = '#copy-report' } = {}) {
    this.data = {
      lab: 'daglei-webrtc-lab',
      experiment,
      timestamp: new Date().toISOString(),
      page: location.href,
      secureContext: window.isSecureContext,
      userAgent: navigator.userAgent,
      userAgentData: null,
      supported: {},
      results: [],
      errors: [],
    };
    this.out = document.querySelector(output);
    this.ready = uaData().then((d) => {
      this.data.userAgentData = d;
      this.render();
    });
    document.querySelector(copyButton)?.addEventListener('click', () => void this.copy());
    if (!window.isSecureContext) {
      this.error('secureContext', { name: 'InsecureContext', message: 'Not a secure context: camera, screen and clipboard APIs are blocked. Use localhost or HTTPS (see README).' });
    }
  }

  /** Record a feature-detection result (true/false or a value). */
  support(name, value) {
    this.data.supported[name] = value;
    this.render();
  }

  /** Record one attempt/result. */
  result(name, detail) {
    this.data.results.push({ name, at: new Date().toISOString(), ...detail });
    this.render();
  }

  error(name, err) {
    this.data.errors.push({ name, at: new Date().toISOString(), error: errorInfo(err) });
    this.render();
  }

  set(key, value) {
    this.data[key] = value;
    this.render();
  }

  json() {
    return JSON.stringify({ ...this.data, timestamp: new Date().toISOString() }, null, 2);
  }

  render() {
    if (this.out) this.out.textContent = this.json();
  }

  async copy() {
    const text = this.json();
    try {
      await navigator.clipboard.writeText(text);
      flash('Report copied as JSON');
    } catch {
      // Clipboard API blocked (insecure context, no permission): select the text instead.
      const area = document.createElement('textarea');
      area.value = text;
      document.body.append(area);
      area.select();
      const ok = document.execCommand?.('copy');
      area.remove();
      flash(ok ? 'Report copied as JSON' : 'Copy blocked: select the report text and copy it by hand');
    }
  }
}

export function flash(text) {
  const el = document.createElement('div');
  el.className = 'flash';
  el.textContent = text;
  document.body.append(el);
  setTimeout(() => el.remove(), 2200);
}

/** Append a line to a log list (timeline). */
export function logLine(list, text) {
  const li = document.createElement('li');
  li.textContent = `${new Date().toISOString().slice(11, 23)}  ${text}`;
  list.append(li);
}

export const $ = (sel) => document.querySelector(sel);
