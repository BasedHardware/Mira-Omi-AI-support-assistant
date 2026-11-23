const assert = require('node:assert/strict');
const test = require('node:test');
const { escalateReply } = require('../utils');
const policy = require('../plannerPolicy');
const cases = require('../supportCases');

async function recorded(status) {
  const service = cases.createCaseService(cases.createMemoryStore());
  let value = await service.getOrCreateCase({ channelId: 'synthetic-thread', customerId: 'synthetic-customer' });
  if (status !== 'queued') value = await service.markDelivered(value.id, { confirmed: true, destination: 'staff-channel' });
  if (status === 'accepted') value = await service.markAccepted(value.id, { staffId: 'synthetic-reviewer' });
  return value;
}

test('delivery is sent for review, not acceptance or a future response', async () => {
  const supportCase = await recorded('delivered');
  supportCase.context.suggestedSpecialist = 'Synthetic specialist';
  const reply = escalateReply('Keep the app installed.', { supportCase, pinged: true, replyInThread: true });
  assert.match(reply, /sent.*support team.*review/i);
  assert.doesNotMatch(reply, /has this now|accepted|will reply|investigat|Synthetic specialist/i);
  assert.match(reply, /Keep the app installed/);
});

test('recorded acceptance reports acceptance without promising work, a reply or timing', async () => {
  const supportCase = await recorded('accepted');
  const reply = escalateReply('Keep the app installed.', { supportCase, replyInThread: true });
  assert.match(reply, /accepted.*review/i);
  assert.doesNotMatch(reply, /will reply|investigat|in progress|tomorrow|within/i);
  const malformed = escalateReply('', { supportCase: { status: 'accepted' }, pinged: true });
  assert.doesNotMatch(malformed, /accepted/i);
});

test('queued or unknown durable state cannot be upgraded by a notification flag', async () => {
  for (const supportCase of [await recorded('queued'), { status: 'unknown' }]) {
    const reply = escalateReply('A review is needed.', { supportCase, pinged: true, replyInThread: true });
    assert.match(reply, /delivery.*not confirmed/i);
    assert.doesNotMatch(reply, /has this now|has been sent|accepted|will reply/i);
  }
});

test('duplicates retain the matching recorded state and failed delivery retains the private fallback', async () => {
  const supportCase = await recorded('delivered');
  const duplicate = escalateReply('Keep the app installed.', { supportCase, duplicate: true, pinged: true });
  assert.match(duplicate, /already.*sent.*review/i);
  assert.doesNotMatch(duplicate, /already has this|accepted|will reply/i);
  const failed = escalateReply('Keep the app installed.', { supportCase, pinged: true, deliveryFailed: true });
  assert.match(failed, /could not deliver.*help@omi\.me/is);
  assert.doesNotMatch(failed, /has been sent|accepted|will reply/i);
});

test('closed and reopened cases cannot reuse a previous acceptance event', async () => {
  const service = cases.createCaseService(cases.createMemoryStore());
  let value = await service.getOrCreateCase({ channelId: 'reopened-thread', customerId: 'returning-customer' });
  value = await service.markDelivered(value.id, { confirmed: true });
  value = await service.markAccepted(value.id, { staffId: 'previous-reviewer' });
  const oldAcceptance = { acceptedBy: value.acceptedBy, acceptedAt: value.acceptedAt };
  value = await service.resolveCase(value.id, { close: true, confirmed: true });
  assert.doesNotMatch(escalateReply('', { supportCase: value, pinged: true }), /accepted/i);
  value = await service.reopenByThread('reopened-thread', 'returning-customer');
  assert.equal(value.status, 'queued');
  assert.equal(value.acceptedBy, null);
  assert.equal(value.acceptedAt, null);
  const reply = escalateReply('', { supportCase: { ...value, ...oldAcceptance }, pinged: true });
  assert.match(reply, /delivery.*not confirmed/i);
  assert.doesNotMatch(reply, /accepted|has been sent|will reply/i);
});

test('another participant’s accepted case cannot authorize the current customer footer', async () => {
  const value = await recorded('accepted');
  const reply = escalateReply('', { supportCase: value, customerId: 'other-customer', pinged: true, replyInThread: true });
  assert.match(reply, /delivery.*not confirmed/i);
  assert.doesNotMatch(reply, /accepted|has been sent|will reply/i);
});

test('financial presentation preserves only the exact event-backed footer and still rejects invented outcomes', async () => {
  const { publicReplyPrivacy } = require('../publicReplyPrivacy');
  const delivered = await recorded('delivered');
  const accepted = await recorded('accepted');
  for (const supportCase of [delivered, accepted]) {
    const context = { supportCase, customerId: supportCase.customerId, question: 'I want a refund.',
      financialContext: true, pinged: true, replyInThread: true, language: 'en' };
    const shown = escalateReply('Your refund has been approved.', context);
    assert.doesNotMatch(shown, /refund has been approved/i);
    assert.match(shown, supportCase.status === 'accepted' ? /accepted.*review/i : /sent.*review/i);
    assert.equal(publicReplyPrivacy(shown, { ...context, handoff: context }).text, shown);
    const unbound = publicReplyPrivacy(shown, { question: context.question, financialContext: true }).text;
    assert.doesNotMatch(unbound, /has been sent|accepted/i);
  }
  const forged = escalateReply('', { supportCase: delivered, question: 'I want a refund.', financialContext: true,
    pinged: true, footers: { sent: 'Your refund has been approved.' } });
  assert.doesNotMatch(forged, /approved/i, 'a caller-supplied locale map cannot exempt arbitrary prose');
});

test('every supported handoff language separates delivery and acceptance without a response promise', async () => {
  const delivered = await recorded('delivered');
  const accepted = await recorded('accepted');
  for (const [language, question] of [
    ['es', 'Necesito ayuda.'], ['pt', 'Preciso de ajuda.'], ['de', 'Ich brauche Hilfe.'],
    ['tr', 'Yardım gerekiyor.'], ['fr', "J’ai besoin d’aide."], ['id', 'Saya perlu bantuan.'],
    ['hi', 'Mujhe madad chahiye.'], ['hi', 'मुझे मदद चाहिए।'], ['ja', '助けが必要です。'],
    ['zh', '我需要帮助。'], ['it', 'Ho bisogno di aiuto.'],
  ]) {
    const footers = policy.handoffFooters({ replyLanguage: language }, question);
    assert.ok(footers.accepted, language);
    assert.notEqual(footers.sent, footers.accepted, language);
    assert.notEqual(footers.pending, footers.sent, language);
    assert.equal(escalateReply('', { supportCase: delivered, pinged: true, replyInThread: true, footers }), footers.thread, language);
    assert.equal(escalateReply('', { supportCase: accepted, pinged: true, replyInThread: true, footers }), footers.accepted, language);
    assert.doesNotMatch(footers.thread, /responderá|responderá|antwortet|yanıt verecek|répondra|akan membalas|jawab dega|जवाब देगा|返信します|等待团队回复|Attendi la risposta/u, language);
  }
});

test('every private-intake locale gives a conditional existing route without promising staff outreach', () => {
  const { publicReplyPrivacy } = require('../publicReplyPrivacy');
  const { looksLikeStaffFuturePromise } = require('../honesty');
  for (const language of ['en', 'de', 'fr', 'es', 'pt', 'it', 'tr', 'id', 'zh', 'ja', 'hi-Deva', 'hi-Latn']) {
    const shown = publicReplyPrivacy('Please post your account email here.', {
      language, privateIntakeNeeded: true, staffDelivered: true, orderAvailable: false,
    });
    assert.ok(shown.privateNextStep.length > 30, language);
    assert.equal(looksLikeStaffFuturePromise(shown.privateNextStep), false, language);
    assert.doesNotMatch(shown.text, /post your account email|will ask|demandera|pedirá|chiederà|isteyecek|akan meminta|poochega|पूछेगा|成员会|確認します|help@|\bDM\b/u, language);
    if (language === 'en') assert.match(shown.privateNextStep, /^If.*existing private conversation with support/);
  }
});
