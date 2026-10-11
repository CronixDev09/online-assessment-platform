import { useEffect, useRef, useState } from 'react';

/**
 * Countdown driven by the server's clock. `serverOffsetMs` is
 * serverNow - clientNow captured when state was loaded, so the client cannot
 * extend its own time by changing the system clock.
 */
export function useServerCountdown(
  expiresAt: string | null | undefined,
  serverOffsetMs: number,
  onExpire: () => void,
): number {
  const [remaining, setRemaining] = useState(0);
  const firedRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    if (!expiresAt) return;
    firedRef.current = false;
    const expiresMs = new Date(expiresAt).getTime();

    const tick = () => {
      const now = Date.now() + serverOffsetMs;
      const secs = Math.max(0, Math.floor((expiresMs - now) / 1000));
      setRemaining(secs);
      if (secs <= 0 && !firedRef.current) {
        firedRef.current = true;
        onExpireRef.current();
      }
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [expiresAt, serverOffsetMs]);

  return remaining;
}
