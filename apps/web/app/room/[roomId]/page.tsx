"use client";

import { use } from "react";

// M1 will mount the rtc-core session here (idempotent lifecycle: React Strict
// Mode double-mounts effects in dev).
export default function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = use(params);
  return (
    <main style={{ padding: 24 }}>
      <h1>Room {roomId}</h1>
      <p>Not connected yet (M1).</p>
    </main>
  );
}
