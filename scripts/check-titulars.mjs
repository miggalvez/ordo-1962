// Place a church's 1st class titular on dates of the year and check that every
// year it is celebrated exactly once: on its own date, or transferred (no. 96),
// if need be into January of the next year. Nothing may lose it.
//
// Usage: node scripts/check-titulars.mjs [from] [to] [--batch 1]
//   --batch N places N titulars at once, a month apart (the test uses 12; 1 is exhaustive).
import { resolveYear } from '../dist/esm/index.js';

const MONTH_DAYS = [];
for (let month = 1; month <= 12; month += 1) {
  const days = new Date(Date.UTC(2028, month, 0)).getUTCDate();
  for (let day = 1; day <= days; day += 1) MONTH_DAYS.push(`${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
}

const isLeap = (year) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/** Groups of month-days, each group spread over the year, together covering every date. */
export function batches(size) {
  const stride = Math.ceil(MONTH_DAYS.length / size);
  return Array.from({ length: stride }, (_, offset) => MONTH_DAYS.filter((_, i) => i % stride === offset));
}

/** Problems found for these titular dates in these years; empty when every titular is kept once a year. */
export function checkTitulars(from, to, monthDays) {
  const problems = [];
  const patrons = monthDays.map((md) => ({ key: `test-titular-${md}`, date: md, colors: ['white'] }));
  const [titular, ...rest] = patrons;
  const church = { titular, patrons: rest };
  const years = new Map();
  const resolved = (year) => {
    if (!years.has(year)) years.set(year, resolveYear(year, { church }));
    return years.get(year);
  };
  for (let year = from; year <= to; year += 1) {
    for (const { key, date } of patrons) {
      if (date === '02-29' && !isLeap(year)) continue;
      const own = `${year}-${date}`;
      const kept = [...resolved(year), ...resolved(year + 1).filter((d) => d.date <= `${year + 1}-01-31`)]
        .filter((d) => d.celebration.key === key && (d.celebration.transferredFrom ?? d.date) === own);
      if (kept.length !== 1) problems.push(`${own}: kept ${kept.length} times`);
      else if (kept[0].date < own) problems.push(`${own}: moved back to ${kept[0].date}`);
    }
  }
  return problems;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [from = 2026, to = 2055] = process.argv.slice(2).filter((a) => /^\d{4}$/.test(a)).map(Number);
  const at = process.argv.indexOf('--batch');
  const size = at > 0 ? Number(process.argv[at + 1]) : 1;
  const started = Date.now();
  const problems = batches(size).flatMap((group) => checkTitulars(from, to, group));
  console.log(problems.length ? problems.join('\n') : `every titular kept once a year, ${from}-${to}, batch ${size}`);
  console.log(`${((Date.now() - started) / 1000).toFixed(1)} s`);
  if (problems.length) process.exitCode = 1;
}
