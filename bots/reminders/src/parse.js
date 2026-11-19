'use strict';
// Analyse d'un rappel en langage naturel, en français et en anglais, sans dépendance.
//
//   « rappelle-moi demain à 9h d'appeler maman »          → demain 09:00, « appeler maman »
//   « dans 20 min sortir le gâteau »                       → maintenant + 20 min
//   « le 5 de chaque mois à 9h payer le loyer »            → mensuel, le 5 à 09:00
//   « remind me every monday and thursday at 7pm to run »  → hebdomadaire lun.+jeu. 19:00
//   « anniversaire de Paul le 12 mars chaque année »       → annuel, 12 mars 09:00
//
// Principe : on cherche les expressions de temps dans une copie « repliée » du texte (minuscules,
// sans accents, même longueur que l'original), on les efface de l'original au fur et à mesure,
// et ce qui reste, nettoyé des formules d'introduction, est le texte du rappel.
// Toutes les dates sont calculées dans le fuseau de l'utilisateur (voir tz.js et schedule.js).

const TZ = require('./tz');
const { nextOccurrence } = require('./schedule');

const LIMITS = {
  MIN_DELAY_MS: 60 * 1000, // un rappel doit tomber au moins 1 min plus tard
  MAX_HORIZON_MS: 5 * 366 * 24 * 3600 * 1000, // 5 ans
  MIN_INTERVAL_MS: 15 * 60 * 1000, // « toutes les N minutes » : 15 min minimum
  TEXT_MAX: 500,
};

const NUMBERS = {
  un: 1, une: 1, a: 1, an: 1, one: 1, deux: 2, two: 2, trois: 3, three: 3, quatre: 4, four: 4, cinq: 5, five: 5,
  six: 6, sept: 7, seven: 7, huit: 8, eight: 8, neuf: 9, nine: 9, dix: 10, ten: 10, onze: 11, eleven: 11, douze: 12, twelve: 12,
  quinze: 15, fifteen: 15, vingt: 20, twenty: 20, trente: 30, thirty: 30, quarante: 40, forty: 40, cinquante: 50, fifty: 50,
};
const NUM = `(\\d+|${Object.keys(NUMBERS).sort((a, b) => b.length - a.length).join('|')})`;
const num = (s) => (s == null ? null : /^\d+$/.test(s) ? Number(s) : NUMBERS[s] ?? null);

const DAYS = {
  dimanche: 0, lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6,
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};
const DAY = `(?:${Object.keys(DAYS).join('|')})`;
const MONTHS = {
  janvier: 1, janv: 1, fevrier: 2, fevr: 2, fev: 2, mars: 3, avril: 4, avr: 4, mai: 5, juin: 6, juillet: 7, juil: 7,
  aout: 8, septembre: 9, sept: 9, octobre: 10, oct: 10, novembre: 11, nov: 11, decembre: 12, dec: 12,
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5, june: 6, jun: 6, july: 7, jul: 7,
  august: 8, aug: 8, september: 9, sep: 9, october: 10, november: 11, december: 12,
};
const MONTH = `(${Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|')})\\.?`;
// Heures par défaut des moments de la journée (quand aucune heure précise n'est donnée).
const PERIODS = { morning: [8, 0], noon: [12, 0], afternoon: [15, 0], evening: [19, 0], night: [22, 0] };
const DEFAULT_TIME = [9, 0];

/** Minuscules, sans accents, apostrophes droites ; la longueur est conservée caractère par caractère. */
function fold(s) {
  let out = '';
  for (const ch of s) {
    let c = ch.toLowerCase();
    if (c === '’' || c === '‘' || c === '`') c = "'";
    const n = c.normalize('NFD').replace(/[̀-ͯ]/g, '');
    out += n.length === ch.length ? n : ch.length === 1 ? (n[0] || c) : c;
  }
  return out;
}

function periodOf(word) {
  if (!word) return null;
  if (/matin|morning/.test(word)) return 'morning';
  if (/apres-?midi|aprem|afternoon/.test(word)) return 'afternoon';
  if (/soir|evening|tonight/.test(word)) return 'evening';
  if (/nuit|night/.test(word)) return 'night';
  if (/midi|noon/.test(word)) return 'noon';
  return null;
}

/**
 * @param {string} input texte de l'utilisateur
 * @param {{ now: number, tz: string }} ctx instant courant (ms) et fuseau IANA de l'utilisateur
 * @returns {{ ok: true, at: number, rule: object|null, text: string } | { ok: false, reason: string }}
 *   reason : 'empty' | 'no_time' | 'past' | 'too_far' | 'interval_too_short' | 'bad_date'
 */
function parseReminder(input, { now, tz }) {
  const original = String(input || '').slice(0, 1000);
  if (!original.trim()) return { ok: false, reason: 'empty' };
  let o = original;
  let f = fold(original);

  /** Cherche `re` dans le texte replié ; efface la correspondance des deux copies et renvoie les groupes. */
  function take(re) {
    const m = re.exec(f);
    if (!m) return null;
    const blank = ' '.repeat(m[0].length);
    f = f.slice(0, m.index) + blank + f.slice(m.index + m[0].length);
    o = o.slice(0, m.index) + blank + o.slice(m.index + m[0].length);
    return m;
  }

  let rule = null; // { kind, ... } — heure et minutes complétées plus bas
  let relativeMs = null;
  let relativeMonths = 0;
  let date = null; // { y, m, d }
  let dayOffset = null; // 0 aujourd'hui, 1 demain…
  let weekdayWanted = null; // { wd, next }
  let dayOfMonth = null;
  let time = null; // [h, mi]
  let period = null;

  // ---------------------------------------------------------------- récurrences
  let m;
  if ((m = take(/\b(?:toutes les|tous les|every)\s+(?:(\d+|deux|trois|quatre|cinq|six|dix|quinze|vingt|trente|two|three|four|five|six|ten|fifteen|twenty|thirty)\s*)?(minutes?|mins?|heures?|hours?|hrs?|h)\b/))) {
    const n = num(m[1]) || 1;
    const unit = /^(m)/.test(m[2]) ? 60e3 : 3600e3;
    rule = { kind: 'interval', everyMs: n * unit };
  } else if ((m = take(/\b(?:en semaine|tous les jours de (?:la )?semaine|du lundi au vendredi|from monday to friday|every weekday|on weekdays|weekdays)\b/))) {
    rule = { kind: 'weekly', days: [1, 2, 3, 4, 5] };
  } else if ((m = take(/\b(?:tous les week-?ends?|chaque week-?end|every weekend|on weekends)\b/))) {
    rule = { kind: 'weekly', days: [0, 6] };
  } else if ((m = take(new RegExp(`\\b(?:tous les|chaque|every|each|on)\\s+(${DAY}s?(?:\\s*(?:,|et|and|&)\\s*${DAY}s?)*)\\b`)))) {
    const days = [...new Set((m[1].match(new RegExp(DAY, 'g')) || []).map((d) => DAYS[d]))].sort();
    // « on monday » seul n'est pas une récurrence : c'est « lundi » (EN). On ne garde que « every/chaque/tous les ».
    if (/^\s*on\s/.test(m[0])) {
      weekdayWanted = { wd: days[0], next: false };
    } else {
      rule = { kind: 'weekly', days };
      const p = periodOf(m[0]);
      if (p) period = p;
    }
  } else if ((m = take(/\b(?:tous les|every)\s+(\d+|deux|trois|quatre|cinq|six|sept|dix|quinze|two|three|four|five|six|seven|ten|fifteen)\s+(?:jours|days)\b/))) {
    rule = { kind: 'daily', n: num(m[1]) || 1 };
  } else if ((m = take(/\b(?:tous les (?:jours|matins|soirs|midis)|chaque (?:jour|matin|soir|midi)|quotidiennement|every (?:day|morning|evening|night|noon)|each (?:day|morning|evening)|daily|everyday)\b/))) {
    rule = { kind: 'daily', n: 1 };
    period = periodOf(m[0]) || period;
  } else if ((m = take(/\b(?:le\s+)?(\d{1,2})(?:er|e|eme|st|nd|rd|th)?\s+(?:de\s+chaque|de tous les|of (?:each|every))\s+mois\b|\b(?:le\s+)?(\d{1,2})(?:er|e|eme|st|nd|rd|th)?\s+(?:de\s+chaque\s+mois|of every month|of each month)\b/))) {
    rule = { kind: 'monthly', day: Number(m[1] || m[2]) };
  } else if ((m = take(/\b(?:tous les mois|chaque mois|every month|each month|monthly)(?:\s+(?:le|on the|on)\s+(\d{1,2})(?:er|e|eme|st|nd|rd|th)?)?\b/))) {
    rule = { kind: 'monthly', day: m[1] ? Number(m[1]) : null };
  } else if ((m = take(/\b(?:tous les ans|chaque annee|chaque an|every year|each year|yearly|annually)\b/))) {
    rule = { kind: 'yearly' };
  }

  // ---------------------------------------------------------------- délai relatif (« dans 2 h », « in 10 minutes »)
  if (!rule) {
    if ((m = take(/\b(?:dans|in)\s+(?:une\s+|a\s+|an\s+)?(?:demi-?heure|half(?:\s+an)?\s+hour)\b/))) relativeMs = 30 * 60e3;
    else if ((m = take(/\b(?:dans|in)\s+(?:un|a)\s+quart(?:\s+d'heure|\s+of\s+an\s+hour)\b/))) relativeMs = 15 * 60e3;
    else if ((m = take(new RegExp(`\\b(?:dans|in)\\s+${NUM}\\s*(minutes?|mins?|mn|m|heures?|hours?|hrs?|h|jours?|days?|j|semaines?|weeks?|mois|months?)(?:\\s*(?:et\\s+|and\\s+)?(\\d{1,2})\\s*(?:minutes?|mins?|mn|m)?)?\\b`)))) {
      const n = num(m[1]);
      const u = m[2];
      if (n != null) {
        if (/^(mois|month)/.test(u)) relativeMonths = n;
        else {
          const unit = /^(minute|min|mn|m$)/.test(u) ? 60e3 : /^(heure|hour|hr|h$)/.test(u) ? 3600e3 : /^(jour|day|j$)/.test(u) ? 86400e3 : 7 * 86400e3;
          relativeMs = n * unit + (m[3] && unit === 3600e3 ? Number(m[3]) * 60e3 : 0);
        }
      }
    }
  }

  // ---------------------------------------------------------------- jour
  if (relativeMs == null && !relativeMonths) {
    if ((m = take(/\b(?:apres-demain|apres demain|(?:the\s+)?day after tomorrow)(?:\s+(matin|midi|apres-midi|soir|morning|afternoon|evening|night))?\b/))) {
      dayOffset = 2; period = periodOf(m[1]) || period;
    } else if ((m = take(/\b(?:demain|tomorrow)(?:\s+(matin|midi|apres-midi|aprem|soir|morning|afternoon|evening|night))?\b/))) {
      dayOffset = 1; period = periodOf(m[1]) || period;
    } else if ((m = take(/\b(?:aujourd'hui|aujourdhui|today|ce soir|tonight|ce matin|this morning|cet apres-midi|cet aprem|this afternoon|this evening|cette nuit|ce midi)\b/))) {
      dayOffset = 0; period = periodOf(m[0]) || period;
    }

    if ((m = take(/\b(\d{4})-(\d{2})-(\d{2})\b/))) {
      date = { y: +m[1], m: +m[2], d: +m[3] };
    } else if ((m = take(/\b(?:le\s+|on\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/))) {
      date = { y: m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : null, m: +m[2], d: +m[1] };
    } else if ((m = take(new RegExp(`\\b(?:le\\s+|on\\s+(?:the\\s+)?)?(\\d{1,2})(?:er|e|st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH}(?:\\s+(\\d{4}))?\\b`)))) {
      date = { y: m[3] ? +m[3] : null, m: MONTHS[m[2]], d: +m[1] };
    } else if ((m = take(new RegExp(`\\b(?:on\\s+)?${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`)))) {
      date = { y: m[3] ? +m[3] : null, m: MONTHS[m[1]], d: +m[2] };
    }

    if (!date && dayOffset == null && weekdayWanted == null) {
      if ((m = take(new RegExp(`\\b(?:(?:ce|cette|le|on|next|this|coming)\\s+)?(${DAY})(?:\\s+(prochain|prochaine|qui vient))?(?:\\s+(matin|midi|apres-midi|soir|morning|afternoon|evening|night))?\\b`)))) {
        weekdayWanted = { wd: DAYS[m[1]], next: /next|prochain|qui vient/.test(m[0]) };
        period = periodOf(m[3]) || period;
      }
    }
    if (!date && dayOffset == null && weekdayWanted == null && !(rule && rule.kind === 'monthly')) {
      if ((m = take(/\b(?:le|on the)\s+(\d{1,2})(?:er|e|eme|st|nd|rd|th)?\b(?!\s*(?:h\b|:|heures?|minutes?|min\b))/))) {
        const d = Number(m[1]);
        if (d >= 1 && d <= 31) dayOfMonth = d;
      }
    }
  }

  // ---------------------------------------------------------------- heure
  if (relativeMs == null) {
    const PER = '(?:\\s+(du matin|de l\'apres-midi|de l\'aprem|du soir|de la nuit|in the morning|in the afternoon|in the evening|at night))?';
    if ((m = take(new RegExp(`\\b(?:a|vers|pour|at|around|by)?\\s*(\\d{1,2})\\s*(?:h|heures?)\\s*(\\d{2})?(?:\\s*(?:min|minutes))?${PER}\\b`)))) {
      time = [Number(m[1]), m[2] ? Number(m[2]) : 0]; if (m[3]) time = withPeriod(time, periodOf(m[3]));
    } else if ((m = take(new RegExp(`\\b(?:a|vers|at|around|by)?\\s*(\\d{1,2}):(\\d{2})\\s*(am|pm|a\\.m\\.|p\\.m\\.)?${PER}`)))) {
      time = ampm([Number(m[1]), Number(m[2])], m[3]); if (m[4]) time = withPeriod(time, periodOf(m[4]));
    } else if ((m = take(/\b(?:at|around|by|a|vers)?\s*(\d{1,2})\s*(am|pm|a\.m\.|p\.m\.)/))) {
      time = ampm([Number(m[1]), 0], m[2]);
    } else if ((m = take(/\b(?:a|at|vers|around)?\s*(midi|noon)\b/))) {
      time = [12, 0];
    } else if ((m = take(/\b(?:a|at|vers|around)?\s*(minuit|midnight)\b/))) {
      time = [0, 0];
    } else if ((m = take(new RegExp(`\\b(?:a|at|vers|around)\\s+(\\d{1,2})\\b(?!\\s*(?:min|jours?|days?|/))${PER}`)))) {
      time = [Number(m[1]), 0]; if (m[2]) time = withPeriod(time, periodOf(m[2]));
    }
    if ((m = take(/\b(?:le matin|dans la matinee|in the morning|l'apres-midi|dans l'apres-midi|in the afternoon|le soir|dans la soiree|in the evening|at night|la nuit)\b/))) {
      const p = periodOf(m[0]);
      if (time) time = withPeriod(time, p);
      else period = p;
    }
    if (time && (time[0] > 23 || time[1] > 59)) return { ok: false, reason: 'bad_date' };
  }

  // ---------------------------------------------------------------- texte du rappel
  const text = cleanText(o) || null;

  // ---------------------------------------------------------------- calcul de l'instant
  const local = TZ.parts(now, tz);
  const today = { y: local.y, m: local.m, d: local.d };
  const hm = time || (period ? PERIODS[period] : null);

  if (rule) {
    if (rule.kind === 'interval') {
      if (rule.everyMs < LIMITS.MIN_INTERVAL_MS) return { ok: false, reason: 'interval_too_short' };
      let start = now + rule.everyMs;
      if (hm) {
        // « toutes les 2 heures à partir de 8h » : premier rappel à l'heure donnée (aujourd'hui ou demain).
        start = TZ.zonedToUtc(today.y, today.m, today.d, hm[0], hm[1], tz);
        while (start <= now + LIMITS.MIN_DELAY_MS) start += rule.everyMs;
      }
      return finalize({ at: start, rule, text }, now);
    }
    const [h, mi] = hm || DEFAULT_TIME;
    const full = { ...rule, h, mi };
    if (full.kind === 'monthly' && !full.day) full.day = date ? date.d : dayOfMonth || local.d;
    if (full.kind === 'yearly') {
      if (!date) return { ok: false, reason: 'no_time' };
      full.month = date.m; full.day = date.d;
    }
    if (full.kind === 'daily' && full.n > 1) full.anchor = date ? civil(date, today) : dayOffset != null ? TZ.addDays(today, dayOffset) : null;
    if (full.kind === 'weekly' && !full.days.length) return { ok: false, reason: 'no_time' };
    const at = nextOccurrence(full, now + LIMITS.MIN_DELAY_MS - 1, tz);
    return finalize({ at, rule: full, text }, now);
  }

  if (relativeMs != null) return finalize({ at: now + relativeMs, rule: null, text }, now);
  if (relativeMonths) {
    const d = TZ.addMonths(today, relativeMonths);
    return finalize({ at: TZ.zonedToUtc(d.y, d.m, d.d, local.h, local.mi, tz), rule: null, text }, now);
  }

  let day = null;
  let rollDays = 0; // si l'instant est passé : +1 jour (heure seule) ; +7 (jour de semaine) ; +1 an (date sans année)
  if (date) {
    if (date.m < 1 || date.m > 12 || date.d < 1 || date.d > TZ.daysInMonth(date.y || today.y, date.m)) return { ok: false, reason: 'bad_date' };
    day = { y: date.y || today.y, m: date.m, d: date.d };
    if (!date.y) rollDays = 'year';
  } else if (dayOffset != null) {
    day = TZ.addDays(today, dayOffset);
  } else if (weekdayWanted) {
    let delta = (weekdayWanted.wd - local.wd + 7) % 7;
    if (weekdayWanted.next && delta === 0) delta = 7;
    day = TZ.addDays(today, delta);
    rollDays = 7;
  } else if (dayOfMonth) {
    let d = { y: today.y, m: today.m, d: Math.min(dayOfMonth, TZ.daysInMonth(today.y, today.m)) };
    if (dayOfMonth < today.d) d = TZ.addMonths({ y: today.y, m: today.m, d: dayOfMonth }, 1);
    day = d;
    rollDays = 'month';
  } else if (hm) {
    day = today;
    rollDays = 1;
  } else {
    return { ok: false, reason: 'no_time' };
  }

  const [h, mi] = hm || DEFAULT_TIME;
  let at = TZ.zonedToUtc(day.y, day.m, day.d, h, mi, tz);
  if (at <= now) {
    if (rollDays === 'year') at = TZ.zonedToUtc(day.y + 1, day.m, day.d, h, mi, tz);
    else if (rollDays === 'month') { const n = TZ.addMonths({ ...day, d: dayOfMonth }, 1); at = TZ.zonedToUtc(n.y, n.m, n.d, h, mi, tz); }
    else if (rollDays) { const n = TZ.addDays(day, rollDays); at = TZ.zonedToUtc(n.y, n.m, n.d, h, mi, tz); }
  }
  return finalize({ at, rule: null, text }, now);
}

function civil(date, today) {
  return { y: date.y || today.y, m: date.m, d: date.d };
}

function ampm([h, mi], suffix) {
  if (!suffix) return [h, mi];
  const pm = /^p/.test(suffix);
  if (h === 12) return [pm ? 12 : 0, mi];
  return [pm ? h + 12 : h, mi];
}

function withPeriod([h, mi], p) {
  if ((p === 'afternoon' || p === 'evening') && h < 12) return [h + 12, mi];
  if (p === 'night' && h >= 7 && h < 12) return [h + 12, mi];
  if (p === 'morning' && h === 12) return [0, mi];
  return [h, mi];
}

function finalize(r, now) {
  if (!Number.isFinite(r.at)) return { ok: false, reason: 'bad_date' };
  if (r.at < now + LIMITS.MIN_DELAY_MS - 1000) return { ok: false, reason: 'past' };
  if (r.at > now + LIMITS.MAX_HORIZON_MS) return { ok: false, reason: 'too_far' };
  return { ok: true, at: r.at, rule: r.rule, text: r.text ? r.text.slice(0, LIMITS.TEXT_MAX) : null };
}

/** Retire les formules d'introduction et les mots de liaison laissés orphelins par l'extraction. */
function cleanText(s) {
  let t = s.replace(/\s+/g, ' ').trim();
  const lead = /^(?:\/\w+(?:@\w+)?\s*|(?:rappelle|rappelez)[- ]?(?:moi|nous)\b\s*|(?:rappel|rappelle|rappelez)\b\s*|remind(?: me| us)?\b\s*|(?:n['’]oublie pas|noublie pas|ne pas oublier|don['’]?t forget|pense [àa]|penser [àa]|think about)\s*|(?:de|du|des|que|to|about|of|pour|for)\b\s*|(?:d['’]|qu['’])\s*|[:,\-–—]\s*)/i;
  for (let i = 0; i < 6; i += 1) {
    const before = t;
    t = t.replace(lead, '').trim();
    if (t === before) break;
  }
  const trail = /\s*(?:\b(?:a|à|at|le|la|les|on|the|et|and|de|du|d'|pour|for|vers|around|,|-|:))\s*$/i;
  for (let i = 0; i < 4; i += 1) {
    const before = t;
    t = t.replace(trail, '').trim();
    if (t === before) break;
  }
  t = t.replace(/\s+([,.!?;:])/g, '$1').replace(/^[,.;:\-–—\s]+|[,;:\-–—\s]+$/g, '');
  return t ? t[0].toUpperCase() + t.slice(1) : '';
}

module.exports = { parseReminder, cleanText, fold, LIMITS };
