import { useEffect, useState } from "react";
import { currentShareSupport, type BrowserInfo, type ShareSupport } from "./browserSupport";

/** Null until mounted, so server and first client render agree. */
export function useBrowserSupport(): { browser: BrowserInfo; support: ShareSupport } | null {
  const [value, setValue] = useState<ReturnType<typeof currentShareSupport> | null>(null);
  useEffect(() => setValue(currentShareSupport()), []);
  return value;
}

/** True on a phone or tablet held upright. Re-evaluates on rotation. */
export function useMobilePortrait(mobile: boolean): boolean {
  const [portrait, setPortrait] = useState(false);
  useEffect(() => {
    if (!mobile) return setPortrait(false);
    const mq = window.matchMedia("(orientation: portrait)");
    const update = () => setPortrait(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [mobile]);
  return portrait;
}
