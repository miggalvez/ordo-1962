import type { Ymd } from './types.js';

// Days are counted from 1970-01-01 in the proleptic Gregorian calendar. A
// liturgical date is a calendar label with no time of day or time zone.
const MS_PER_DAY = 86_400_000;

export function dayNumber(year: number, month: number, day: number): number {
  return Date.UTC(year, month - 1, day) / MS_PER_DAY;
}

export function toYmd(day: number): Ymd {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

export function fromYmd(ymd: Ymd): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) throw new RangeError(`not a YYYY-MM-DD date: ${ymd}`);
  const [, y, m, d] = match;
  const day = dayNumber(Number(y), Number(m), Number(d));
  if (toYmd(day) !== ymd) throw new RangeError(`not a calendar date: ${ymd}`);
  return day;
}

/** 0 is Sunday, 6 is Saturday. */
export function weekday(day: number): number {
  return (((day + 4) % 7) + 7) % 7;
}

export function monthDay(day: number): string {
  return toYmd(day).slice(5);
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Easter Sunday in the Gregorian calendar (Meeus/Jones/Butcher algorithm). */
export function easterSunday(year: number): number {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return dayNumber(year, month, day);
}
