import { useRef, type KeyboardEvent, type PointerEvent } from "react";

interface SliderProps {
  label: string;
  /** 0 to 1. */
  value: number;
  onChange(value: number): void;
}

const STEP = 0.05;
const clamp = (n: number) => Math.min(1, Math.max(0, n));

/** The design system's slider: a real role="slider", keyboard and pointer driven. */
export function Slider({ label, value, onChange }: SliderProps) {
  const ref = useRef<HTMLSpanElement>(null);

  const fromPointer = (e: PointerEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (rect && rect.width > 0) onChange(clamp(Math.round(((e.clientX - rect.left) / rect.width) / STEP) * STEP));
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const delta = e.key === "ArrowRight" || e.key === "ArrowUp" ? STEP : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -STEP : 0;
    if (e.key === "Home") onChange(0);
    else if (e.key === "End") onChange(1);
    else if (delta) onChange(clamp(value + delta));
    else return;
    e.preventDefault();
  };

  const pct = Math.round(value * 100);
  return (
    <span
      ref={ref}
      className="slider"
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        fromPointer(e);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) fromPointer(e);
      }}
    >
      <i style={{ width: `${pct}%` }} />
      <b style={{ left: `${pct}%` }} />
    </span>
  );
}
