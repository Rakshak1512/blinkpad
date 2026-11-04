export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export function formatTimeRemaining(ms: number): {
  hours: number;
  minutes: number;
  seconds: number;
  isExpired: boolean;
  isWarning: boolean; // < 1 hour
  formatted: string;
} {
  if (ms <= 0) {
    return {
      hours: 0,
      minutes: 0,
      seconds: 0,
      isExpired: true,
      isWarning: false,
      formatted: 'Expired',
    };
  }

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const isWarning = ms <= 60 * 60 * 1000;

  const hStr = hours.toString().padStart(2, '0');
  const mStr = minutes.toString().padStart(2, '0');
  const sStr = seconds.toString().padStart(2, '0');

  return {
    hours,
    minutes,
    seconds,
    isExpired: false,
    isWarning,
    formatted: `${hStr}h ${mStr}m ${sStr}s`,
  };
}

/**
 * Formats a Unix millisecond timestamp into:
 * `D Month YYYY, hh:mm:ss AM/PM` (e.g. `4 November 2026, 11:53:47 PM`)
 * Always using the `Asia/Kolkata` (IST) timezone.
 */
export function formatDate(timestamp: number): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  const parts = formatter.formatToParts(date);
  const p: Record<string, string> = {};
  for (const item of parts) {
    p[item.type] = item.value;
  }

  const period = p.dayPeriod ? p.dayPeriod.toUpperCase() : '';
  return `${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute}:${p.second} ${period}`.trim();
}

export const formatBlinkpadDate = formatDate;
