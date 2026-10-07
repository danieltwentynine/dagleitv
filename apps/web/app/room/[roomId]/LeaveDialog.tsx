import { useEffect, useRef } from "react";
import styles from "./room.module.css";

interface LeaveDialogProps {
  open: boolean;
  sharing: boolean;
  micOn: boolean;
  onStay(): void;
  onLeave(): void;
}

/** Confirms leaving while something is live. Native <dialog>: Esc and focus trapping for free. */
export function LeaveDialog({ open, sharing, micOn, onStay, onLeave }: LeaveDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  const what = sharing && micOn ? "Your share and mic will stop" : sharing ? "Your share will stop" : "Your mic will turn off";
  return (
    <dialog ref={ref} className={styles.dialog} onClose={onStay} aria-labelledby="leave-title" data-testid="leave-dialog">
      <h2 id="leave-title">Leave the room?</h2>
      <p>{what}, and your partner will be left waiting.</p>
      <div className={styles.dialogActions}>
        <button className="btn" onClick={onStay} autoFocus>
          Stay
        </button>
        <button className="btn btn-danger" onClick={onLeave} data-testid="confirm-leave">
          Leave
        </button>
      </div>
    </dialog>
  );
}
