'use strict';
// Transforme un webhook externe (GitHub, Uptime Kuma, générique) en message GPChat : { text, buttons? }.
// Fonctions pures, testées sans réseau. Le texte est en Markdown GPChat.

const short = (s, n = 140) => { const x = String(s || '').replace(/\s+/g, ' ').trim(); return x.length > n ? `${x.slice(0, n - 1)}…` : x; };
const link = (text, url) => (/^https:\/\//.test(url || '') ? [{ text: short(text, 32), url }] : []);

function github(event, p) {
  const repo = p.repository && p.repository.full_name;
  const who = (p.sender && p.sender.login) || 'quelqu\'un';
  const rows = [];
  switch (event) {
    case 'ping': return { text: `🔔 Webhook GitHub connecté${repo ? ` à **${repo}**` : ''}.` };
    case 'push': {
      const branch = String(p.ref || '').replace('refs/heads/', '');
      const n = (p.commits || []).length;
      if (p.deleted) return { text: `🗑️ **${who}** a supprimé la branche \`${branch}\` de **${repo}**.` };
      const last = (p.commits || []).slice(-1)[0];
      if (p.compare) rows.push(link('Voir les changements', p.compare));
      return { text: `⬆️ **${who}** a poussé ${n} commit${n > 1 ? 's' : ''} sur \`${branch}\` (**${repo}**)${last ? `\n_${short(last.message, 100)}_` : ''}`, buttons: rows.filter((r) => r.length) };
    }
    case 'pull_request': {
      const pr = p.pull_request || {};
      const merged = p.action === 'closed' && pr.merged;
      const label = merged ? '🟣 fusionnée' : ({ opened: '🟢 ouverte', closed: '🔴 fermée', reopened: '🟢 rouverte', ready_for_review: '👀 prête pour relecture' }[p.action]);
      if (!label) return null;
      return { text: `${label} — PR #${pr.number} **${short(pr.title, 90)}** (${repo}) par ${who}`, buttons: [link('Ouvrir la PR', pr.html_url)] };
    }
    case 'issues': {
      const i = p.issue || {};
      if (!['opened', 'closed', 'reopened'].includes(p.action)) return null;
      return { text: `🐞 Issue #${i.number} **${short(i.title, 90)}** ${p.action === 'opened' ? 'ouverte' : p.action === 'closed' ? 'fermée' : 'rouverte'} (${repo}) par ${who}`, buttons: [link('Voir l\'issue', i.html_url)] };
    }
    case 'workflow_run': {
      const r = p.workflow_run || {};
      if (p.action !== 'completed') return null;
      const ok = r.conclusion === 'success';
      return { text: `${ok ? '✅' : r.conclusion === 'cancelled' ? '⚪' : '❌'} **${short(r.name, 60)}** ${ok ? 'réussi' : r.conclusion === 'cancelled' ? 'annulé' : 'en échec'} sur \`${r.head_branch}\` (${repo})`, buttons: [link('Voir le run', r.html_url)] };
    }
    case 'release': {
      const r = p.release || {};
      if (p.action !== 'published') return null;
      return { text: `🏷️ Nouvelle version **${r.tag_name}** de ${repo}`, buttons: [link('Notes de version', r.html_url)] };
    }
    default: return null; // événements non gérés : ignorés sans bruit
  }
}

function uptimeKuma(p) {
  const hb = p.heartbeat || {};
  const name = (p.monitor && p.monitor.name) || 'Service';
  if (hb.status === 0) return { text: `🔴 **${name}** est HORS LIGNE${p.msg ? `\n_${short(p.msg, 120)}_` : ''}`, level: 'error' };
  if (hb.status === 1) return { text: `🟢 **${name}** est de retour en ligne.`, level: 'ok' };
  return null;
}

const LEVELS = { error: '🔴', warning: '🟠', warn: '🟠', ok: '🟢', success: '🟢', info: 'ℹ️' };
/** Format libre : { title?, message, level?, url? } */
function generic(p) {
  const text = `${LEVELS[String(p.level || 'info').toLowerCase()] || 'ℹ️'} ${p.title ? `**${short(p.title, 90)}**\n` : ''}${short(p.message || p.text || '', 600)}`.trim();
  if (!p.title && !p.message && !p.text) return null;
  return { text, buttons: [link(p.urlLabel || 'Ouvrir', p.url)] };
}

/** Détecte la source d'après les en-têtes et le corps. */
function format(headers, body) {
  const gh = headers['x-github-event'];
  let out = null;
  if (gh) out = github(gh, body || {});
  else if (body && body.heartbeat && body.monitor) out = uptimeKuma(body);
  else if (body) out = generic(body);
  if (!out) return null;
  const buttons = (out.buttons || []).filter((r) => r.length);
  return { text: out.text, buttons: buttons.length ? buttons : undefined };
}

module.exports = { format, github, uptimeKuma, generic, short };
