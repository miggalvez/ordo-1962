// Place a church's 1st class titular on dates of the year and check two things
// every year. The titular is celebrated exactly once: on its own date, on the date
// it is assigned for good when a higher feast always holds its own (nos. 100-102),
// or transferred from there (no. 96), if need be into January of the next year.
// And it erases nothing: no fixed feast of the 1st or 2nd class is left on the
// titular's day to be dropped.
//
// Usage: node scripts/check-titulars.mjs [from] [to] [--batch 1] [--dedication] [--of-the-lord]
//   --batch N places N titulars at once, spread over the year (1 is exhaustive).
//   --dedication checks the anniversary of the dedication instead, one date at a time.
//   --of-the-lord marks the titulars feasts of the Lord; a year in which no. 95 omits
//   one, because a higher feast of the same Person falls on it, is then reported.
import { CATALOGUE, DEDICATION_KEY, fixedFeasts, resolveYear } from '../dist/esm/index.js';

const MONTH_DAYS = [];
for (let month = 1; month <= 12; month += 1) {
  const days = new Date(Date.UTC(2027, month, 0)).getUTCDate();
  for (let day = 1; day <= days; day += 1) MONTH_DAYS.push(`${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
}
const BY_KEY = new Map(CATALOGUE.map((entry) => [entry.key, entry]));

/** Groups of month-days, each group spread over the year, together covering every date. */
export function batches(size) {
  const stride = Math.ceil(MONTH_DAYS.length / size);
  return Array.from({ length: stride }, (_, offset) => MONTH_DAYS.filter((_, i) => i % stride === offset));
}

function check(from, to, church, feasts) {
  const problems = [];
  const keys = new Set(feasts.map((feast) => feast.key));
  const years = new Map();
  const resolved = (year) => {
    if (!years.has(year)) years.set(year, resolveYear(year, { church }));
    return years.get(year);
  };
  for (let year = from; year <= to; year += 1) {
    // The date each feast has this year: its own, or the one it is assigned for good.
    const home = new Map();
    for (const [date, placed] of fixedFeasts(year, { church })) for (const key of placed) if (keys.has(key)) home.set(key, date);
    const days = [...resolved(year), ...resolved(year + 1).filter((d) => d.date <= `${year + 1}-01-31`)];
    for (const { key, date } of feasts) {
      const own = home.get(key);
      if (!own) { problems.push(`${year}-${date}: not placed`); continue; }
      if (own.slice(5) < date && own.slice(5) > '01-31') problems.push(`${year}-${date}: assigned back to ${own}`);
      const kept = days.filter((d) => d.celebration.key === key && (d.celebration.transferredFrom ?? d.date) === own);
      if (kept.length !== 1) problems.push(`${year}-${date}: kept ${kept.length} times`);
      else if (kept[0].date < own) problems.push(`${year}-${date}: moved back to ${kept[0].date}`);
    }
    for (const day of resolved(year)) {
      if (!keys.has(day.celebration.key)) continue;
      for (const lost of day.displaced) {
        const entry = BY_KEY.get(lost);
        if (entry && 'fixed' in entry.date && entry.kind === 'feast' && entry.class <= 2 && !entry.formularyOf && !day.commemorations.includes(lost)) {
          problems.push(`${day.date}: ${day.celebration.key} erases ${lost}`);
        }
      }
    }
  }
  return problems;
}

/** Problems found for these titular dates in these years; empty when every titular is kept once a year and erases nothing. */
export function checkTitulars(from, to, monthDays, { ofTheLord = false } = {}) {
  const patrons = monthDays.map((md) => ({ key: `test-titular-${md}`, date: md, colors: ['white'], ofTheLord }));
  const [titular, ...rest] = patrons;
  return check(from, to, { titular, patrons: rest }, patrons);
}

/** The same for the anniversary of the dedication on each of these dates, one church at a time. */
export function checkDedications(from, to, monthDays) {
  return monthDays.flatMap((md) => check(from, to, { dedication: md }, [{ key: DEDICATION_KEY, date: md }]));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [from = 2026, to = 2055] = process.argv.slice(2).filter((a) => /^\d{4}$/.test(a)).map(Number);
  const at = process.argv.indexOf('--batch');
  const size = at > 0 ? Number(process.argv[at + 1]) : 1;
  const ofTheLord = process.argv.includes('--of-the-lord');
  const started = Date.now();
  const dedication = process.argv.includes('--dedication');
  const problems = dedication
    ? checkDedications(from, to, batches(1).flat())
    : batches(size).flatMap((group) => checkTitulars(from, to, group, { ofTheLord }));
  const what = dedication ? 'the dedication on every date' : `every titular, batch ${size}`;
  console.log(problems.length ? problems.join('\n') : `${what}: kept once a year and nothing erased, ${from}-${to}`);
  console.log(`${problems.length} problems, ${((Date.now() - started) / 1000).toFixed(1)} s`);
  if (problems.length) process.exitCode = 1;
}
