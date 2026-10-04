"use client";

import { useRouter } from "next/navigation";

function randomRoomCode(length = 10): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export default function Home() {
  const router = useRouter();
  return (
    <main style={{ display: "grid", placeItems: "center", minHeight: "100vh", gap: 16 }}>
      <div style={{ textAlign: "center" }}>
        <h1>Daglei TV</h1>
        <button onClick={() => router.push(`/room/${randomRoomCode()}`)}>Create room</button>
      </div>
    </main>
  );
}
