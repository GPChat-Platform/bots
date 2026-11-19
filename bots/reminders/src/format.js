'use strict';
// Mise en forme des dates, délais et récurrences dans la langue et le fuseau de l'utilisateur.
const { t } = require('./i18n');
const TZ = require('./tz');

const locale = (lang) => (lang === 'en' ? 'en-GB' : 'fr-FR');
const hhmm = (h, mi) => `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;

/** « aujourd'hui à 18:30 », « demain à 09:00 », « vendredi 20 novembre à 09:00 », « 12 mars 2027 à 09:00 ». */
function when(at, tz, lang, now = Date.now()) {
  const p = TZ.parts(at, tz);
  const today = TZ.parts(now, tz);
  const time = hhmm(p.h, p.mi);
  const dayDiff = Math.round((Date.UTC(p.y, p.m - 1, p.d) - Date.UTC(today.y, today.m - 1, today.d)) / 86400e3);
  const at_ = t(lang, 'at');
  if (dayDiff === 0) return lang === 'en' ? `today at ${time}` : `aujourd’hui à ${time}`;
  if (dayDiff === 1) return lang === 'en' ? `tomorrow at ${time}` : `demain à ${time}`;
  const opts = { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' };
  if (p.y !== today.y) opts.year = 'numeric';
  return `${new Intl.DateTimeFormat(locale(lang), opts).format(at)} ${at_} ${time}`;
}

/** Délai lisible : « dans 2 h 30 », « in 3 d 4 h ». */
function rel(at, lang, now = Date.now()) {
  const ms = at - now;
  const abs = Math.abs(ms);
  const mins = Math.round(abs / 60e3);
  let x;
  if (mins < 1) return t(lang, 'rel.now');
  if (mins < 60) x = t(lang, 'rel.min', { n: mins });
  else if (mins < 24 * 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    x = m ? t(lang, 'rel.hmin', { h, m: String(m).padStart(2, '0') }) : t(lang, 'rel.h', { n: h });
  } else {
    const d = Math.floor(mins / 1440);
    const h = Math.round((mins % 1440) / 60);
    x = h && d < 7 ? t(lang, 'rel.dh', { d, h }) : t(lang, 'rel.d', { n: d });
  }
  return ms >= 0 ? t(lang, 'rel.in', { x }) : t(lang, 'rel.ago', { x });
}

/** Délai court sans « dans » (pour « en retard de 12 min »). */
function duration(ms, lang) {
  return rel(Date.now() + ms, lang).replace(/^(dans|in) /, '');
}

/** Libellé d'une règle : « tous les lundis et jeudis à 19:00 », « le 5 de chaque mois à 09:00 ». */
function ruleLabel(rule, lang) {
  if (!rule) return '';
  const atTime = rule.kind === 'interval' ? '' : ` ${t(lang, 'at')} ${hhmm(rule.h, rule.mi)}`;
  switch (rule.kind) {
    case 'interval': {
      const mins = Math.round(rule.everyMs / 60e3);
      return mins % 60 === 0 ? t(lang, 'every.hours', { n: mins / 60 }) : t(lang, 'every.minutes', { n: mins });
    }
    case 'daily':
      return (rule.n > 1 ? t(lang, 'every.nDays', { n: rule.n }) : t(lang, 'every.day')) + atTime;
    case 'weekly': {
      const d = [...rule.days].sort().join(',');
      if (d === '1,2,3,4,5') return t(lang, 'every.weekdays') + atTime;
      if (d === '0,6') return t(lang, 'every.weekend') + atTime;
      const names = rule.days.map((x) => t(lang, 'days')[x]);
      const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} ${t(lang, 'and')} ${names[names.length - 1]}` : names[0];
      return t(lang, 'every.week', { days: list }) + atTime;
    }
    case 'monthly':
      return t(lang, 'every.month', { d: rule.day }) + atTime;
    case 'yearly': {
      const date = new Intl.DateTimeFormat(locale(lang), { timeZone: 'UTC', day: 'numeric', month: 'long' }).format(Date.UTC(2000, rule.month - 1, rule.day));
      return t(lang, 'every.year', { date }) + atTime;
    }
    default:
      return '';
  }
}

/** Heure courante dans un fuseau (« 14:05 »). */
function clock(tz, now = Date.now()) {
  const p = TZ.parts(now, tz);
  return hhmm(p.h, p.mi);
}

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

module.exports = { when, rel, duration, ruleLabel, clock, clip, hhmm };
