import { ROOM_ID_PATTERN } from "@dagleitv/protocol";

export function randomRoomCode(length = 10): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

/** Accepts a bare room code or a full room link and returns the code. */
export function parseRoomCode(input: string): string | null {
  const text = input.trim();
  const fromLink = text.match(/\/room\/([^/?#\s]+)/)?.[1];
  const code = fromLink ?? text;
  return ROOM_ID_PATTERN.test(code) ? code : null;
}
