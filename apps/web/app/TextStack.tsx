import type { ReactNode } from "react";
import styles from "./TextStack.module.css";

export interface TextStackItem {
  label: string;
  body: ReactNode;
}

/** Stacked text blocks: a mono label above a short paragraph, separated by hairlines. */
export function TextStack({ title, items }: { title: string; items: TextStackItem[] }) {
  return (
    <section className={styles.stack} aria-labelledby="text-stack-title">
      <h2 id="text-stack-title" className="t-label">{title}</h2>
      {items.map((item) => (
        <div key={item.label} className={styles.item}>
          <span className={`t-label ${styles.label}`}>{item.label}</span>
          <p className={`t-body ${styles.body}`}>{item.body}</p>
        </div>
      ))}
    </section>
  );
}
