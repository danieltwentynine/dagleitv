import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { CHAT_MAX_LENGTH } from "@dagleitv/protocol";

export interface ChatLine {
  id: number;
  from: "me" | "partner";
  text: string;
  ts: number;
}

interface ChatPanelProps {
  onHide(): void;
  messages: ChatLine[];
  canSend: boolean;
  onSend(text: string): void;
}

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });

/** Docked chat. Mount it only while open; Room keeps the messages. */
export function ChatPanel({ onHide, messages, canSend, onSend }: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages]);

  useEffect(() => inputRef.current?.focus(), []);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || !canSend) return;
    onSend(text);
    setDraft("");
  };

  // Enter sends, Shift+Enter adds a line.
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <aside className="chat" aria-label="Chat">
      <div className="chat-h">
        <span className="t-label">Chat</span>
        <button className="btn btn-ghost btn-sm cut c-s" onClick={onHide} aria-label="Close chat" data-testid="chat-close">
          <span className="kbd cut c-s">C</span> hide
        </button>
      </div>
      <div className="chat-note">ephemeral. messages vanish when the room closes.</div>
      <div className="chat-l" ref={listRef} data-testid="chat-list" role="log" aria-live="polite">
        {messages.length === 0 && <div className="chat-e">no messages yet.</div>}
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.from === "me" ? "me" : "them"}`}>
            <div className="m">
              <b>{m.from === "me" ? "YOU" : "PARTNER"}</b>
              {timeFormat.format(m.ts)}
            </div>
            <div className={`x cut c-s`}>{m.text}</div>
          </div>
        ))}
      </div>
      <form className="chat-f" onSubmit={submit}>
        <div className={`input cut c-tr`}>
          <textarea
            ref={inputRef}
            data-testid="chat-input"
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            maxLength={CHAT_MAX_LENGTH}
            placeholder={canSend ? "type a message" : "waiting for your partner"}
            disabled={!canSend}
            aria-label="Message"
          />
        </div>
        <div className="hint">Enter to send &middot; Shift+Enter for newline</div>
      </form>
    </aside>
  );
}
