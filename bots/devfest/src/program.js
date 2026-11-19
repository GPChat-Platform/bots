'use strict';
// Programme de l'événement : données (JSON) + fonctions pures (maintenant / prochain / recherche).
// Un texte peut être une chaîne ou { fr, en }.
const fs = require('node:fs');

const tr = (v, lang) => (v && typeof v === 'object' ? v[lang] || v.fr || '' : v || '');

function load(file, fallback) {
  for (const f of [file, fallback]) {
    try {
      if (f && fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch { /* fichier invalide : on essaie le suivant */ }
  }
  throw new Error('Programme introuvable (data/program.json ou data/program.example.json)');
}

const start = (s) => Date.parse(s.start);
const end = (s) => Date.parse(s.end || new Date(start(s) + 30 * 60000).toISOString());

function sorted(program) { return [...program.sessions].sort((a, b) => start(a) - start(b)); }
const current = (program, now) => sorted(program).filter((s) => start(s) <= now && now < end(s));
const upcoming = (program, now) => sorted(program).filter((s) => start(s) > now);

/** Heure locale de l'événement (fuseau configurable, Africa/Douala par défaut). */
function hhmm(iso, tz = 'Africa/Douala') {
  return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(new Date(iso));
}

function line(s, lang, tz) {
  const where = tr(s.room, lang);
  return `**${hhmm(s.start, tz)}** — ${tr(s.title, lang)}${s.speaker ? ` · ${s.speaker}` : ''}${where ? ` · ${where}` : ''}  \`#${s.id}\``;
}

module.exports = { load, tr, current, upcoming, sorted, hhmm, line, start, end };
