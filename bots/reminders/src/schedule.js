'use strict';
// Récurrences : calcul de la prochaine occurrence d'une règle, dans le fuseau de l'utilisateur.
//
// Règles (toujours avec h, mi = heure murale locale, sauf `interval`) :
//   { kind: 'daily', n: 1 }                    tous les jours (n > 1 : tous les n jours depuis `anchor`)
//   { kind: 'weekly', days: [1, 4] }           chaque lundi et jeudi (0 = dimanche)
//   { kind: 'monthly', day: 31 }               le 31 de chaque mois (ramené au dernier jour si le mois est plus court)
//   { kind: 'yearly', month: 3, day: 12 }      chaque 12 mars (29 février → 28 les années non bissextiles)
//   { kind: 'interval', everyMs }              toutes les N minutes / heures (instant absolu)

const TZ = require('./tz');

const SEARCH_DAYS = 800;

/** Premier instant (ms) strictement postérieur à `afterMs` qui satisfait la règle. */
function nextOccurrence(rule, afterMs, tz, lastAt = null) {
  if (rule.kind === 'interval') {
    const base = lastAt != null ? lastAt : afterMs;
    let t = base + rule.everyMs;
    if (t <= afterMs) t += Math.ceil((afterMs - t + 1) / rule.everyMs) * rule.everyMs;
    return t;
  }
  const p = TZ.parts(afterMs, tz);
  let day = { y: p.y, m: p.m, d: p.d };
  for (let i = 0; i < SEARCH_DAYS; i += 1) {
    if (matches(rule, day)) {
      const at = TZ.zonedToUtc(day.y, day.m, day.d, rule.h, rule.mi, tz);
      if (at > afterMs) return at;
    }
    day = TZ.addDays(day, 1);
  }
  return NaN;
}

function matches(rule, day) {
  switch (rule.kind) {
    case 'daily': {
      if (!rule.n || rule.n <= 1 || !rule.anchor) return true;
      const diff = Math.round((Date.UTC(day.y, day.m - 1, day.d) - Date.UTC(rule.anchor.y, rule.anchor.m - 1, rule.anchor.d)) / 86400e3);
      return diff >= 0 && diff % rule.n === 0;
    }
    case 'weekly':
      return rule.days.includes(TZ.weekday(day));
    case 'monthly':
      return day.d === Math.min(rule.day, TZ.daysInMonth(day.y, day.m));
    case 'yearly':
      return day.m === rule.month && day.d === Math.min(rule.day, TZ.daysInMonth(day.y, day.m));
    default:
      return false;
  }
}

module.exports = { nextOccurrence, matches };
