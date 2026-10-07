/**
 * Screen capture. Constraint choices (system audio on, processing off) are
 * my best understanding of Chrome behavior and are the thing the M1 spike
 * is meant to confirm on real machines; see describeCapture().
 */
export async function captureDisplay(): Promise<MediaStream> {
  // systemAudio / selfBrowserSurface aren't in every lib.dom version.
  const constraints = {
    video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      // Leave out sound this page plays (the partner's voice), so it isn't
      // captured with the system audio and echoed back to them.
      restrictOwnAudio: true,
    },
    systemAudio: "include",
    selfBrowserSurface: "exclude",
  } as DisplayMediaStreamOptions;
  return navigator.mediaDevices.getDisplayMedia(constraints);
}

/** Microphone for voice chat (M4), with the browser's voice processing on. */
export async function captureMic(): Promise<MediaStreamTrack> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  return stream.getAudioTracks()[0]!;
}

/** Synthetic mic (a steady tone) for tests. Must be called from a user gesture. */
export function captureFakeMic(): MediaStreamTrack {
  const audioCtx = new AudioContext();
  const osc = audioCtx.createOscillator();
  osc.frequency.value = 330;
  const dest = audioCtx.createMediaStreamDestination();
  osc.connect(dest);
  osc.start();
  const track = dest.stream.getAudioTracks()[0]!;
  track.addEventListener("ended", () => void audioCtx.close());
  return track;
}

/**
 * Synthetic source (animated canvas + tone) for automated tests and for
 * testing without a real screen. Must be called from a user gesture
 * (AudioContext autoplay policy).
 */
export function captureFake(): MediaStream {
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext("2d")!;
  let frame = 0;
  const draw = () => {
    ctx.fillStyle = `hsl(${(frame * 2) % 360} 70% 40%)`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#fff";
    ctx.font = "64px sans-serif";
    ctx.fillText(`Daglei TV test frame ${frame++}`, 60, 360);
  };
  draw();
  const timer = setInterval(draw, 1000 / 30);
  const stream = canvas.captureStream(30);

  const audioCtx = new AudioContext();
  const osc = audioCtx.createOscillator();
  const dest = audioCtx.createMediaStreamDestination();
  osc.connect(dest);
  osc.start();
  const audioTrack = dest.stream.getAudioTracks()[0]!;
  stream.addTrack(audioTrack);

  const videoTrack = stream.getVideoTracks()[0]!;
  videoTrack.addEventListener("ended", () => {
    clearInterval(timer);
    osc.stop();
    void audioCtx.close();
  });
  return stream;
}

/** Facts the M1 spike needs: did we get system audio, what did we really get. */
export function describeCapture(stream: MediaStream) {
  const supported = navigator.mediaDevices.getSupportedConstraints() as Record<string, unknown>;
  const video = stream.getVideoTracks()[0];
  return {
    videoLabel: video?.label,
    videoSettings: video?.getSettings(),
    audioTrackCount: stream.getAudioTracks().length,
    audio: stream.getAudioTracks().map((t) => ({ label: t.label, settings: t.getSettings() })),
    supportedConstraints: {
      systemAudio: supported["systemAudio"],
      suppressLocalAudioPlayback: supported["suppressLocalAudioPlayback"],
      restrictOwnAudio: supported["restrictOwnAudio"],
      displaySurface: supported["displaySurface"],
    },
  };
}
