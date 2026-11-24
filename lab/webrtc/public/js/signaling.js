// Signaling client for the lab server: EventSource down, fetch POST up.

export function connectSignaling({ room, role, onWelcome, onPeerJoined, onPeerLeft, onSignal, onError }) {
  const url = `/signal/events?room=${encodeURIComponent(room)}&role=${encodeURIComponent(role)}`;
  const events = new EventSource(url);
  let myId = null;

  events.addEventListener('welcome', (e) => {
    const data = JSON.parse(e.data);
    myId = data.id;
    onWelcome?.(data);
  });
  events.addEventListener('peer-joined', (e) => onPeerJoined?.(JSON.parse(e.data)));
  events.addEventListener('peer-left', (e) => onPeerLeft?.(JSON.parse(e.data)));
  events.addEventListener('signal', (e) => onSignal?.(JSON.parse(e.data)));
  events.onerror = () => onError?.(new Error(`signaling connection ${events.readyState === EventSource.CLOSED ? 'closed' : 'interrupted (retrying)'}`));

  async function send(type, payload, to) {
    if (!myId) throw new Error('not joined yet');
    const res = await fetch('/signal/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room, from: myId, to, type, payload }),
    });
    if (!res.ok) throw new Error(`signal ${type} failed: ${res.status} ${await res.text()}`);
  }

  return { send, close: () => events.close(), get id() { return myId; } };
}
