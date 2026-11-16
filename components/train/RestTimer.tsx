'use client';

import { useEffect, useState } from 'react';
import { useUi } from '@/lib/ui';

/** Floating rest timer (SPEC §7): counts down the low end of the rest range, then says Go. */
export function RestTimer() {
  const rest = useUi((s) => s.rest);
  const ready = useUi((s) => s.restReady);
  const stop = useUi((s) => s.stopRest);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!rest) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= rest.endAt) {
        useUi.setState({ rest: null, restReady: { max: rest.max } });
        try {
          navigator.vibrate?.([180, 80, 180]);
        } catch {
          /* vibration unsupported */
        }
      }
    }, 250);
    return () => clearInterval(id);
  }, [rest]);

  if (!rest && !ready) return null;
  const left = rest ? Math.max(0, Math.ceil((rest.endAt - now) / 1000)) : 0;
  const clock = ready ? 'Go' : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  return (
    <div className="rest-timer">
      {/* Screen readers hear when rest starts and ends, not every tick of the clock. */}
      <span className="sr-only" role="status" aria-live="polite">
        {ready ? 'Rest done. Ready for your next set.' : `Rest timer started: ${rest!.min} to ${rest!.max} seconds.`}
      </span>
      <div className="row" style={{ alignItems: 'baseline', gap: 12 }} aria-hidden="true">
        <span className={`clock${ready ? ' go' : ''}`}>{clock}</span>
        <span className="txt">
          {ready ? `Ready for your next set (rest up to ${ready.max} sec if you need it)` : `Rest · ${rest!.min}–${rest!.max} sec`}
        </span>
      </div>
      <button type="button" onClick={stop}>
        {ready ? 'Close' : 'Skip'}
      </button>
    </div>
  );
}
