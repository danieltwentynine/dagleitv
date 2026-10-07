import { CloseIcon } from "../../icons";
import styles from "./room.module.css";

interface StatsDrawerProps {
  open: boolean;
  onClose(): void;
  netText: string;
  diag: unknown;
}

/** Debug readouts from M1/M2, kept out of the way. Text stays copy-pasteable. */
export function StatsDrawer({ open, onClose, netText, diag }: StatsDrawerProps) {
  return (
    <aside className={styles.drawer} data-open={open} aria-hidden={!open} aria-label="Connection stats">
      <div className={styles.drawerHead}>
        <h2>Connection stats</h2>
        <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close stats">
          <CloseIcon />
        </button>
      </div>
      <section className={styles.drawerSection}>
        <h3>Network</h3>
        <pre data-testid="net">{netText}</pre>
      </section>
      <section className={styles.drawerSection}>
        <h3>Capture</h3>
        <pre data-testid="diag">{diag ? JSON.stringify(diag, null, 2) : "Not sharing yet."}</pre>
      </section>
    </aside>
  );
}
