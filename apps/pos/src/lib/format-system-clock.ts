/**
 * Formats a Date (the operator PC's system clock) for the POS header.
 *
 * Uses the client's local time — the kiosk hides the Windows taskbar clock,
 * so this mirrors the system clock the operator would otherwise see.
 *
 * - date: `Wed 23 Sep 2026`
 * - time: `2:35:07 PM` (12-hour, zero-padded minutes/seconds)
 */
export interface SystemClockParts {
  date: string;
  time: string;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatSystemClock(d: Date): SystemClockParts {
  const hours24 = d.getHours();
  const period = hours24 < 12 ? 'AM' : 'PM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;

  const date = `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  const time = `${hours12}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())} ${period}`;
  return { date, time };
}
