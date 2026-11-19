'use strict';
// « /fuseau Douala » → 'Africa/Douala'. Accepte une ville courante, un nom IANA (insensible à la casse)
// ou un décalage fixe « UTC+1 » / « GMT-5 » (heures entières, sans heure d'été).
const { fold } = require('./parse');
const { isValidZone } = require('./tz');

const CITIES = {
  douala: 'Africa/Douala', yaounde: 'Africa/Douala', bafoussam: 'Africa/Douala', garoua: 'Africa/Douala', cameroun: 'Africa/Douala', cameroon: 'Africa/Douala',
  libreville: 'Africa/Libreville', gabon: 'Africa/Libreville', malabo: 'Africa/Malabo', bangui: 'Africa/Bangui', ndjamena: 'Africa/Ndjamena', "n'djamena": 'Africa/Ndjamena',
  brazzaville: 'Africa/Brazzaville', kinshasa: 'Africa/Kinshasa', lubumbashi: 'Africa/Lubumbashi', luanda: 'Africa/Luanda',
  lagos: 'Africa/Lagos', abuja: 'Africa/Lagos', nigeria: 'Africa/Lagos', cotonou: 'Africa/Porto-Novo', benin: 'Africa/Porto-Novo', niamey: 'Africa/Niamey',
  abidjan: 'Africa/Abidjan', "cote d'ivoire": 'Africa/Abidjan', dakar: 'Africa/Dakar', senegal: 'Africa/Dakar', bamako: 'Africa/Bamako', ouagadougou: 'Africa/Ouagadougou',
  lome: 'Africa/Lome', togo: 'Africa/Lome', accra: 'Africa/Accra', ghana: 'Africa/Accra', conakry: 'Africa/Conakry',
  casablanca: 'Africa/Casablanca', rabat: 'Africa/Casablanca', maroc: 'Africa/Casablanca', morocco: 'Africa/Casablanca', alger: 'Africa/Algiers', algiers: 'Africa/Algiers', tunis: 'Africa/Tunis',
  'le caire': 'Africa/Cairo', cairo: 'Africa/Cairo', nairobi: 'Africa/Nairobi', kenya: 'Africa/Nairobi', kigali: 'Africa/Kigali', johannesburg: 'Africa/Johannesburg', 'addis abeba': 'Africa/Addis_Ababa', 'addis ababa': 'Africa/Addis_Ababa',
  paris: 'Europe/Paris', france: 'Europe/Paris', bruxelles: 'Europe/Brussels', brussels: 'Europe/Brussels', geneve: 'Europe/Zurich', geneva: 'Europe/Zurich', zurich: 'Europe/Zurich',
  londres: 'Europe/London', london: 'Europe/London', berlin: 'Europe/Berlin', madrid: 'Europe/Madrid', rome: 'Europe/Rome', lisbonne: 'Europe/Lisbon', lisbon: 'Europe/Lisbon',
  montreal: 'America/Toronto', toronto: 'America/Toronto', quebec: 'America/Toronto', 'new york': 'America/New_York', washington: 'America/New_York',
  chicago: 'America/Chicago', 'los angeles': 'America/Los_Angeles', 'san francisco': 'America/Los_Angeles', 'sao paulo': 'America/Sao_Paulo',
  dubai: 'Asia/Dubai', beijing: 'Asia/Shanghai', pekin: 'Asia/Shanghai', shanghai: 'Asia/Shanghai', tokyo: 'Asia/Tokyo', mumbai: 'Asia/Kolkata', delhi: 'Asia/Kolkata',
  utc: 'UTC', gmt: 'UTC',
};

let ianaIndex = null;
function iana() {
  if (!ianaIndex) {
    ianaIndex = new Map();
    const list = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
    for (const z of list) ianaIndex.set(z.toLowerCase(), z);
  }
  return ianaIndex;
}

/** Renvoie un fuseau IANA valide, ou null. */
function resolveZone(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  const key = fold(raw).replace(/\s+/g, ' ');
  if (CITIES[key]) return CITIES[key];
  const off = /^(?:utc|gmt)\s*([+-])\s*(\d{1,2})(?::?00)?$/.exec(key);
  if (off) {
    const h = Number(off[2]);
    if (h > 14) return null;
    if (h === 0) return 'UTC';
    // Les zones Etc/GMT ont un signe inversé : UTC+1 = Etc/GMT-1.
    return `Etc/GMT${off[1] === '+' ? '-' : '+'}${h}`;
  }
  const exact = iana().get(key.replace(/ /g, '_'));
  if (exact) return exact;
  if (isValidZone(raw)) return raw;
  return null;
}

module.exports = { resolveZone, CITIES };
