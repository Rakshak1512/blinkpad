import { useState, useEffect } from 'react';
import { formatTimeRemaining } from '../utils/formatters';

export function useCountdown(targetTimestamp: number | null | undefined) {
  const [now, setNow] = useState<number>(Date.now());

  useEffect(() => {
    if (!targetTimestamp) return;

    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, [targetTimestamp]);

  if (!targetTimestamp) {
    return {
      hours: 0,
      minutes: 0,
      seconds: 0,
      isExpired: false,
      isWarning: false,
      formatted: '--:--:--',
    };
  }

  const diff = targetTimestamp - now;
  return formatTimeRemaining(diff);
}

