import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from '@gowayy/design-system';

/** Symbol-only splash using the exact shared GOWAYY mark. */
export function Splash({ onDone }: { onDone: () => void }) {
  const finish = useRef(onDone);
  finish.current = onDone;
  useEffect(() => {
    const timer = window.setTimeout(() => finish.current(), prefersReducedMotion() ? 240 : 1480);
    return () => window.clearTimeout(timer);
  }, []);
  return <div className="brand-splash" aria-hidden="true">
    <img src="/brand/g-mono-inverse.svg" alt="" />
  </div>;
}
