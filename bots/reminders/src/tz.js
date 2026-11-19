'use strict';
// Calendrier dans un fuseau IANA sans dépendance (Intl) : décomposition d'un instant en date/heure
// locales, conversion « heure murale » → instant UTC (changements d'heure compris), arithmétique de dates.

const fmtCache = new Map();
function formatter(tz) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric', weekday: 'short',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Instant (ms) → { y, m (1-12), d, h, mi, s, wd (0 = dimanche) } dans le fuseau `tz`. */
function parts(ms, tz) {
  const o = {};
  for (const p of formatter(tz).formatToParts(new Date(ms))) o[p.type] = p.value;
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second, wd: WD[o.weekday] };
}

/** Décalage du fuseau à cet instant, en ms (UTC+1 → 3 600 000). */
function offsetAt(ms, tz) {
  const p = parts(ms, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - (ms - (ms % 1000));
}

/**
 * Heure murale dans `tz` → instant UTC (ms). Une heure « sautée » au passage à l'heure d'été est
 * décalée vers l'heure suivante ; une heure « doublée » prend la première occurrence.
 */
function zonedToUtc(y, m, d, h, mi, tz) {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  // Les deux décalages possibles autour de cette date (identiques hors changement d'heure).
  const offs = [...new Set([offsetAt(guess - 86400e3, tz), offsetAt(guess, tz), offsetAt(guess + 86400e3, tz)])];
  const candidates = offs.map((o) => guess - o).sort((a, b) => a - b);
  const exact = candidates.filter((c) => {
    const p = parts(c, tz);
    return p.y === y && p.m === m && p.d === d && p.h === h && p.mi === mi;
  });
  if (exact.length) return exact[0]; // heure doublée : première occurrence
  return candidates[candidates.length - 1]; // heure sautée : on avance d'autant
}

/** Ajoute `n` jours à une date civile { y, m, d } (calendrier grégorien, sans fuseau). */
function addDays({ y, m, d }, n) {
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), wd: t.getUTCDay() };
}

/** Ajoute `n` mois, en ramenant le jour au dernier du mois si besoin (31 janvier + 1 mois → 28/29 février). */
function addMonths({ y, m, d }, n) {
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return { y: ny, m: nm, d: Math.min(d, daysInMonth(ny, nm)) };
}

function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Jour de la semaine d'une date civile (0 = dimanche). */
function weekday({ y, m, d }) {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Le fuseau existe-t-il pour ce moteur Intl ? */
function isValidZone(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(0);
    return true;
  } catch {
    return false;
  }
}

module.exports = { parts, offsetAt, zonedToUtc, addDays, addMonths, daysInMonth, weekday, isValidZone };
