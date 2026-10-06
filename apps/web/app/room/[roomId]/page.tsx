"use client";

import { use } from "react";
import { Room } from "./Room";

export default function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = use(params);
  return <Room roomId={roomId} />;
}
