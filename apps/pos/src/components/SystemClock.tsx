import { useEffect, useState } from 'react';
import { formatSystemClock } from '../lib/format-system-clock';

export function SystemClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const { date, time } = formatSystemClock(now);

  return (
    <div
      aria-label="Current system date and time"
      className="text-right leading-tight tabular-nums select-none"
    >
      <div className="text-sm text-gray-200">{time}</div>
      <div className="text-xs text-gray-400">{date}</div>
    </div>
  );
}
