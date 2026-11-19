'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHandler } = require('../src/handler');
const { button } = require('../../packages/sdk');

test('/start répond avec un bouton, le texte est renvoyé, le clic est géré', async () => {
  const sent = [];
  const bot = { sendMessage: async (to, text, o) => sent.push({ to, text, o }) };
  const handle = createHandler({ bot, button });
  await handle({ type: 'message.received', data: { chatId: 'u1', type: 'text', textMsg: '/start' } });
  assert.equal(sent[0].o.buttons[0][0].callbackData, 'hello');
  await handle({ type: 'message.received', data: { chatId: 'u1', type: 'text', textMsg: 'salut' } });
  assert.equal(sent[1].text, 'Vous avez dit : salut');
  await handle({ type: 'callback.received', data: { chatId: 'u1', data: 'hello' } });
  assert.match(sent[2].text, /Bonjour/);
});
