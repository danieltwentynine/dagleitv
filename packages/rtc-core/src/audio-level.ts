/**
 * Speech detection for the "who is talking" indicators: polls the RMS level
 * of an audio stream and reports when it crosses a threshold.
 *
 * Chrome only feeds a remote WebRTC track into Web Audio while the track is
 * also playing in a media element, so play remote voice in an <audio> first.
 */
export function watchSpeaking(
  stream: MediaStream,
  onChange: (speaking: boolean) => void,
  { threshold = 0.02, intervalMs = 100, holdMs = 400 } = {},
): () => void {
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  const samples = new Float32Array(analyser.fftSize);

  let speaking = false;
  let lastLoud = 0;
  const timer = setInterval(() => {
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const s of samples) sum += s * s;
    const rms = Math.sqrt(sum / samples.length);
    const now = performance.now();
    if (rms > threshold) lastLoud = now;
    // Hold briefly so the indicator doesn't flicker between words.
    const next = now - lastLoud < holdMs;
    if (next !== speaking) {
      speaking = next;
      onChange(speaking);
    }
  }, intervalMs);

  return () => {
    clearInterval(timer);
    source.disconnect();
    void ctx.close();
    if (speaking) onChange(false);
  };
}
