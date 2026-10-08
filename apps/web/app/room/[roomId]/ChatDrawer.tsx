import { useEffect, useRef, useState, type FormEvent } from "react";
import { CHAT_MAX_LENGTH } from "@dagleitv/protocol";
import { CloseIcon, SendIcon } from "../../icons";
import styles from "./room.module.css";

export interface ChatLine {
  id: number;
  from: "me" | "partner";
  text: string;
  ts: number;
}

interface ChatDrawerProps {
  open: boolean;
  onClose(): void;
  messages: ChatLine[];
  canSend: boolean;
  onSend(text: string): void;
}

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

export function ChatDrawer({ open, onClose, messages, canSend, onSend }: ChatDrawerProps) {
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLOListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !canSend) return;
    onSend(text);
    setDraft("");
  };

  return (
    <aside className={styles.drawer} data-open={open} aria-hidden={!open} aria-label="Chat">
      <div className={styles.drawerHead}>
        <h2>Chat</h2>
        <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close chat">
          <CloseIcon />
        </button>
      </div>
      <ol className={styles.chatList} ref={listRef} data-testid="chat-list">
        {messages.length === 0 && <li className={styles.chatEmpty}>No messages yet.</li>}
        {messages.map((m) => (
          <li key={m.id} className={styles.chatMsg} data-from={m.from}>
            <span className={styles.chatText}>{m.text}</span>
            <span className={styles.chatMeta}>
              {m.from === "me" ? "You" : "Partner"} · {timeFormat.format(m.ts)}
            </span>
          </li>
        ))}
      </ol>
      <form className={styles.chatForm} onSubmit={submit}>
        <input
          ref={inputRef}
          data-testid="chat-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={CHAT_MAX_LENGTH}
          placeholder={canSend ? "Message your partner" : "Waiting for your partner…"}
          disabled={!canSend}
          aria-label="Message"
          autoComplete="off"
        />
        <button className="btn btn-primary btn-icon" type="submit" disabled={!canSend || !draft.trim()} aria-label="Send">
          <SendIcon />
        </button>
      </form>
    </aside>
  );
}
