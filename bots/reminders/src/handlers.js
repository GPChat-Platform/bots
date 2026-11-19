'use strict';
// Logique du bot Rappels : commandes, texte libre, boutons, envoi des rappels dus.
const { t } = require('./i18n');
const F = require('./format');
const { parseReminder } = require('./parse');
const { resolveZone } = require('./zones');
const { LIMITS } = require('./store');

const COMMANDS = {
  start: 'start', aide: 'help', help: 'help',
  rappel: 'remind', rappelle: 'remind', remind: 'remind', reminder: 'remind', nouveau: 'remind', new: 'remind',
  liste: 'list', list: 'list', rappels: 'list', reminders: 'list',
  supprimer: 'delete', delete: 'delete', del: 'delete', effacer: 'delete',
  fuseau: 'tz', timezone: 'tz', tz: 'tz',
  langue: 'lang', lang: 'lang', language: 'lang',
  exemples: 'examples', examples: 'examples',
  apropos: 'about', about: 'about',
};

/** « /rappel@rappels_bot demain 9h » → { name: 'remind', arg: 'demain 9h' } ; texte libre → { name: 'free', arg }. */
function parseCommand(text) {
  const s = String(text || '').trim();
  if (!s) return null;
  if (!s.startsWith('/')) return { name: 'free', arg: s };
  const m = /^\/([a-zA-Z_]+)(?:@\w+)?\s*([\s\S]*)$/.exec(s);
  if (!m) return null;
  return { name: COMMANDS[m[1].toLowerCase()] || 'unknown', arg: m[2].trim() };
}

function createHandler({ bot, store, button, version = '', now = Date.now, log = { info() {}, warn() {}, error() {} } }) {
  const prefs = (userId) => store.user(userId);
  const target = (c) => (c.groupId ? { groupId: c.groupId } : { to: c.to });

  function say(c, text, opts = {}) {
    if (c.groupId) return bot.sendGroupMessage(c.groupId, text, { markdown: true, ...opts });
    return bot.sendMessage(c.to, text, { markdown: true, ...opts });
  }

  const quickButtons = (lang) => [[button.callback(t(lang, 'btnList'), 'l'), button.callback(t(lang, 'btnExamples'), 'x:examples'), button.callback(t(lang, 'btnHelp'), 'x:help')]];

  // ---------------------------------------------------------------- création
  async function create(c, userId, input) {
    const p = prefs(userId);
    const { lang, tz } = p;
    if (!input) return say(c, t(lang, 'empty'));
    const scope = c.groupId ? { groupId: c.groupId } : { owner: userId };
    const max = c.groupId ? LIMITS.ACTIVE_PER_GROUP : LIMITS.ACTIVE_PER_USER;
    if (store.countActive(scope) >= max) return say(c, t(lang, c.groupId ? 'groupLimit' : 'limit', { n: max }));

    const n = now();
    const r = parseReminder(input, { now: n, tz });
    if (!r.ok) {
      const key = { no_time: 'noTime', empty: 'empty', past: 'past', too_far: 'tooFar', interval_too_short: 'intervalShort', bad_date: 'badDate' }[r.reason] || 'noTime';
      return say(c, t(lang, key, { text: F.clip(input.replace(/^\/\w+\s*/, ''), 60) }), { buttons: key === 'noTime' ? [[button.callback(t(lang, 'btnExamples'), 'x:examples')]] : undefined });
    }
    const text = r.text || t(lang, 'defaultText');
    const rec = store.add({ owner: userId, chat: target(c), text, nextAt: r.at, rule: r.rule, tz, lang });
    log.info('rappel créé', { id: rec.id, recurring: Boolean(r.rule), group: Boolean(c.groupId) });
    const params = { when: F.when(r.at, tz, lang, n), rel: F.rel(r.at, lang, n), text, rule: F.ruleLabel(r.rule, lang) };
    return say(c, t(lang, r.rule ? 'createdRecurring' : 'created', params), {
      buttons: [[button.callback(t(lang, 'btnCancel'), `c:${rec.id}`), button.callback(t(lang, 'btnList'), 'l')]],
    });
  }

  // ---------------------------------------------------------------- liste et suppression
  function listOf(c, userId) {
    return store.activeFor(c.groupId ? { groupId: c.groupId } : { owner: userId });
  }

  async function list(c, userId) {
    const { lang } = prefs(userId);
    const items = listOf(c, userId);
    if (!items.length) return say(c, t(lang, 'listEmpty'), { buttons: [[button.callback(t(lang, 'btnExamples'), 'x:examples')]] });
    const n = now();
    const lines = items.slice(0, 30).map((r, i) => {
      const repeat = r.rule ? ` · 🔁 ${F.ruleLabel(r.rule, lang)}` : '';
      return `**${i + 1}.** ${F.clip(r.text, 80)}\n    ⏰ ${F.when(r.nextAt, r.tz, lang, n)} (${F.rel(r.nextAt, lang, n)})${repeat}`;
    });
    const buttons = [];
    const deletable = items.slice(0, 10).map((r, i) => button.callback(t(lang, 'btnDelete', { n: i + 1 }), `d:${r.id}`));
    for (let i = 0; i < deletable.length; i += 5) buttons.push(deletable.slice(i, i + 5));
    const title = t(lang, c.groupId ? 'listGroupTitle' : 'listTitle', { n: items.length });
    return say(c, `${title}\n\n${lines.join('\n')}\n${t(lang, 'listFoot')}`, { buttons });
  }

  function canEdit(r, userId) {
    return r.owner === userId;
  }

  async function del(c, userId, arg) {
    const { lang } = prefs(userId);
    const items = listOf(c, userId);
    if (!arg) return say(c, t(lang, 'deleteWhich'));
    if (/^(tout|tous|all|\*)$/i.test(arg)) {
      const mine = items.filter((r) => canEdit(r, userId));
      for (const r of mine) store.remove(r.id);
      return say(c, t(lang, 'deletedAll', { n: mine.length }));
    }
    const idx = Number.parseInt(arg, 10);
    const r = Number.isInteger(idx) ? items[idx - 1] : null;
    if (!r) return say(c, t(lang, 'deleteNotFound', { n: F.clip(arg, 10) }));
    if (!canEdit(r, userId)) return say(c, t(lang, 'notYours'));
    store.remove(r.id);
    return say(c, t(lang, 'deleted', { text: F.clip(r.text, 80) }));
  }

  // ---------------------------------------------------------------- réglages
  async function setTz(c, userId, arg) {
    const p = prefs(userId);
    if (!arg) return say(c, t(p.lang, 'tzAsk', { tz: p.tz, time: F.clock(p.tz, now()) }));
    const zone = resolveZone(arg);
    if (!zone) return say(c, t(p.lang, 'tzBad'));
    p.tz = zone;
    store.save();
    return say(c, t(p.lang, 'tzSet', { tz: zone, time: F.clock(zone, now()) }));
  }

  async function setLang(c, userId, arg) {
    const p = prefs(userId);
    const v = String(arg || '').toLowerCase();
    if (!['fr', 'en'].includes(v)) return say(c, t(p.lang, 'langAsk'));
    p.lang = v;
    store.save();
    return say(c, t(v, 'langSet'));
  }

  // ---------------------------------------------------------------- aiguillage
  async function commands(c, userId, cmd) {
    const p = prefs(userId);
    switch (cmd.name) {
      case 'start': return say(c, t(p.lang, 'welcome', { tz: p.tz }), { buttons: quickButtons(p.lang) });
      case 'help': return say(c, t(p.lang, 'help'), { buttons: quickButtons(p.lang) });
      case 'examples': return say(c, t(p.lang, 'examples'));
      case 'about': return say(c, t(p.lang, 'about', { version: version ? `v${version}` : '' }));
      case 'remind': return create(c, userId, cmd.arg);
      case 'free': return create(c, userId, cmd.arg);
      case 'list': return list(c, userId);
      case 'delete': return del(c, userId, cmd.arg);
      case 'tz': return setTz(c, userId, cmd.arg);
      case 'lang': return setLang(c, userId, cmd.arg);
      default: return say(c, t(p.lang, 'unknown'));
    }
  }

  async function callback(c, userId, data, msgId) {
    const { lang } = prefs(userId);
    const [kind, id, extra] = String(data || '').split(':');
    if (kind === 'l') return list(c, userId);
    if (kind === 'x') return commands(c, userId, { name: id, arg: '' });
    const r = id ? store.get(id) : null;
    if (!r) return undefined; // rappel déjà supprimé : on ignore le bouton sans bruit
    // En groupe, tout membre peut marquer « Fait » ou reporter ; annuler/supprimer reste réservé au créateur.
    const shared = r.chat.groupId && (kind === 'k' || kind === 'z');
    if (!shared && !canEdit(r, userId)) return say(c, t(lang, 'notYours'));
    const edit = async (text) => {
      if (msgId) {
        try { return await bot.editMessage(target(c), msgId, { content: text, buttons: null }); } catch { /* message trop ancien : repli */ }
      }
      return say(c, text);
    };
    switch (kind) {
      case 'c': // annuler un rappel tout juste créé
      case 'd': // supprimer depuis la liste
        store.remove(r.id);
        return kind === 'c' ? edit(t(lang, 'cancelled')) : say(c, t(lang, 'deleted', { text: F.clip(r.text, 80) }));
      case 'k': // « Fait »
        return edit(t(lang, 'done', { text: F.clip(r.text, 200) }));
      case 'z': { // reporter : +N minutes, ou « t » = demain à la même heure
        const n = now();
        const at = extra === 't' ? n + 24 * 3600e3 : n + Math.max(1, Number(extra) || 10) * 60e3;
        const scope = r.chat.groupId ? { groupId: r.chat.groupId } : { owner: r.owner };
        const max = r.chat.groupId ? LIMITS.ACTIVE_PER_GROUP : LIMITS.ACTIVE_PER_USER;
        if (store.countActive(scope) >= max) return say(c, t(lang, r.chat.groupId ? 'groupLimit' : 'limit', { n: max }));
        store.add({ owner: r.owner, chat: r.chat, text: r.text, nextAt: at, rule: null, tz: r.tz, lang: r.lang, snoozedFrom: r.id });
        return edit(t(lang, 'snoozed', { when: F.when(at, r.tz, lang, n), rel: F.rel(at, lang, n), text: F.clip(r.text, 200) }));
      }
      default:
        return undefined;
    }
  }

  /** Point d'entrée : une mise à jour GPChat (polling ou webhook). */
  async function handle(update) {
    const d = update.data || {};
    const userId = d.from;
    if (!userId) return;
    let c;
    try {
      if (update.type === 'message.received') {
        c = { to: d.chatId || d.from };
        const cmd = parseCommand(d.textMsg);
        if (!cmd || d.type !== 'text') return;
        await commands(c, userId, cmd);
      } else if (update.type === 'group_message.received') {
        c = { groupId: d.groupId };
        const cmd = parseCommand(d.textMsg);
        // En groupe : uniquement les commandes, ou un message qui mentionne le bot (jamais toute la conversation).
        if (!cmd || d.type !== 'text' || (cmd.name === 'free' && !d.isMentioned)) return;
        if (cmd.name === 'free') cmd.arg = cmd.arg.replace(/@\w+/g, ' ').trim();
        await commands(c, userId, cmd);
      } else if (update.type === 'callback.received') {
        c = d.groupId ? { groupId: d.groupId } : { to: d.chatId || d.from };
        await callback(c, userId, d.data, d.msgId);
      }
    } catch (e) {
      if (c) await say(c, t(prefs(userId).lang, 'error'), { markdown: false }).catch(() => {});
      log.error('échec de traitement', { type: update.type, error: e && e.message, status: e && e.status });
    }
  }

  /** Envoi d'un rappel arrivé à échéance (appelé par le planificateur ; une exception = nouvel essai). */
  async function deliver(r, { lateMs, nextAt }) {
    const lang = r.lang || 'fr';
    let text = t(lang, r.chat.groupId ? 'fireGroup' : 'fire', { text: r.text });
    if (lateMs) text += t(lang, 'fireLate', { late: F.duration(lateMs, lang) });
    if (r.rule && Number.isFinite(nextAt)) text += t(lang, 'fireNext', { when: F.when(nextAt, r.tz, lang, now()) });
    const buttons = [
      [button.callback(t(lang, 'btnDone'), `k:${r.id}`), button.callback(t(lang, 'btnSnooze10'), `z:${r.id}:10`), button.callback(t(lang, 'btnSnooze60'), `z:${r.id}:60`), button.callback(t(lang, 'btnTomorrow'), `z:${r.id}:t`)],
    ];
    await say(r.chat.groupId ? { groupId: r.chat.groupId } : { to: r.chat.to }, text, { buttons });
  }

  return { handle, deliver, parseCommand };
}

module.exports = { createHandler, parseCommand, COMMANDS };
