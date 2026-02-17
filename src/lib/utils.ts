import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Parse various timestamp formats to local "YYYY-MM-DD HH:MM:SS".
 *  Handles History dash-separated format ("2026-02-17T14-30-00")
 *  and standard RFC3339 ("2026-02-17T14:30:00+00:00"). */
export function formatTime(raw: string): string {
  const pad = (n: number) => String(n).padStart(2, "0");

  // Try History dash format: T followed by HH-MM-SS
  const dashMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})/);
  if (dashMatch) {
    const [, y, mo, d, h, mi, s] = dashMatch;
    const utc = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`);
    if (!isNaN(utc.getTime())) {
      return `${utc.getFullYear()}-${pad(utc.getMonth() + 1)}-${pad(utc.getDate())} ${pad(utc.getHours())}:${pad(utc.getMinutes())}:${pad(utc.getSeconds())}`;
    }
  }

  // Fallback: RFC3339 / ISO 8601
  const date = new Date(raw);
  if (!isNaN(date.getTime())) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  return raw;
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let index = 0;
  let value = bytes;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(1)} ${units[index]}`;
}
