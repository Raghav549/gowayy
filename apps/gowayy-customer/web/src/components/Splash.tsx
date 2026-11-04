import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from '@gowayy/design-system';

/** Brief, low-cost reveal of the exact official purple-and-orange mark. */
export function Splash({ onDone }: { onDone: () => void }) {
  const finish = useRef(onDone);
  finish.current = onDone;
  useEffect(() => {
    const timer = window.setTimeout(() => finish.current(), prefersReducedMotion() ? 240 : 1480);
    return () => window.clearTimeout(timer);
  }, []);
  return <div className="brand-splash" aria-label="GOWAYY is starting">
    <div className="brand-splash__lockup">
      <span className="brand-splash__mark" aria-hidden="true">
        <img className="brand-splash__purple" src="/brand/g-purple.svg" alt="" />
        <img className="brand-splash__orange" src="/brand/g-orange.svg" alt="" />
      </span>
      <span className="brand-splash__wordmark">GOWAYY</span>
    </div>
    <span className="brand-splash__caption">Your day, in the flow.</span>
    <button className="brand-splash__skip" onClick={() => finish.current()}>Skip intro</button>
  </div>;
}
