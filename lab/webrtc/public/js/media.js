// Media sources for the call experiments: a synthetic canvas stream (no permission
// needed) or the camera / screen.

/** A moving test pattern with a clock, as a MediaStream (canvas.captureStream). */
export function syntheticStream({ width = 640, height = 360, fps = 30 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  if (!canvas.captureStream) throw Object.assign(new Error('canvas.captureStream is not supported'), { name: 'NotSupportedError' });
  const ctx = canvas.getContext('2d');
  let frame = 0;
  const timer = setInterval(() => {
    frame++;
    const hue = (frame * 2) % 360;
    ctx.fillStyle = `hsl(${hue} 60% 40%)`;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#fff';
    ctx.font = `${Math.round(height / 8)}px system-ui, sans-serif`;
    ctx.fillText(new Date().toISOString().slice(11, 23), 20, height / 2);
    ctx.fillRect((frame * 6) % width, height - 30, 40, 20);
  }, 1000 / fps);
  const stream = canvas.captureStream(fps);
  stream.getVideoTracks()[0].addEventListener('ended', () => clearInterval(timer));
  const stop = () => {
    clearInterval(timer);
    stream.getTracks().forEach((t) => t.stop());
  };
  return { stream, stop };
}

/** source: 'synthetic' | 'camera' | 'screen' */
export async function getSource(source) {
  if (source === 'camera') {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    return { stream, stop: () => stream.getTracks().forEach((t) => t.stop()) };
  }
  if (source === 'screen') {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    return { stream, stop: () => stream.getTracks().forEach((t) => t.stop()) };
  }
  return syntheticStream();
}
