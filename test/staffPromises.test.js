const assert = require('node:assert/strict');
const test = require('node:test');
const { stripStaffLies, looksLikeStaffLie } = require('../honesty');
const { stripPingNarration, escalateReply } = require('../utils');
const { parseAgentJson, reviewAnswer } = require('../commandcode');
const { getRemovalAudit } = require('../answerFilterAudit');
const { prepareDraftForReviewWithAudit, presentReviewedAnswer } = require('../answerPipeline');

const promises = [
  'The Omi team will reply here once your request reaches support.',
  'A support specialist will personally investigate this tomorrow.',
  'Our engineers are going to follow up after reviewing the report.',
  'They’ll get back to you in this conversation.',
  'We will ask privately for the required information.',
  'The support team will be replying in this conversation.',
  'Our support specialists will be in touch soon.',
  'You will hear back from the Omi support team.',
  'Expect a response from support in this conversation.',
  'El equipo de soporte responderá en esta conversación.',
  'A equipe de suporte entrará em contato amanhã.',
  'Unser Support-Team wird dir in diesem Thread antworten.',
  'Destek ekibi bu başlıkta yanıt verecek.',
  'Une personne du support vous répondra dans ce fil.',
  'Anggota tim akan meminta informasi secara pribadi.',
  'Support team ka sadasya isi thread mein jawab dega.',
  'सहायता टीम का सदस्य इस थ्रेड में जवाब देगा।',
  'サポート担当者がこのスレッドで返信します。',
  '支持团队会在这个讨论串回复您。',
  'Una persona del supporto ti risponderà in questa conversazione.',
];

test('untrusted staff response and outreach promises are removed across the supported grammar', () => {
  for (const promise of promises) {
    assert.equal(looksLikeStaffLie(promise), true, promise);
    assert.equal(stripPingNarration(promise), '', promise);
    assert.doesNotMatch(stripStaffLies(promise), /will reply|will ask|has this now|have not messaged/i);
    assert.ok(!presentReviewedAnswer(promise).includes(promise), promise);
    assert.ok(!escalateReply(promise, { pinged: true }).includes(promise), promise);
  }
});

test('staff requirements, earlier human work, customer actions and honest uncertainty survive', () => {
  for (const text of [
    'A person needs to review this request.',
    'The support team replied earlier with a workaround.',
    'The customer said staff checked the earlier logs.',
    'You can reply in this thread with the app version.',
    'No response time has been confirmed.',
  ]) {
    assert.equal(looksLikeStaffLie(text), false, text);
    assert.equal(stripStaffLies(text), text);
    assert.equal(stripPingNarration(text), text);
  }
});

test('removing a mixed promise preserves the complete original unit for independent context repair', async () => {
  const mixed = 'Your upload still stalls after the earlier retry; the support team will reply here after delivery.';
  const parsed = parseAgentJson(JSON.stringify({ final_answer: mixed, confidence: 1 }));
  assert.ok(getRemovalAudit(parsed).removed.includes(mixed));
  const prepared = prepareDraftForReviewWithAudit(parsed.final_answer, 'faq', 'The upload still stalls after my retry.', { earlierAudit: getRemovalAudit(parsed) });
  assert.ok(prepared.removed.includes(mixed));
  assert.ok(!prepared.draft.includes('will reply'));
  const checked = await reviewAnswer({ question: 'The upload still stalls after my retry.', lane: 'faq',
    draft: prepared.draft, removedBySafetyFilters: prepared.removed, sources: '', post: async () => ({ data: { choices: [{ message: {
      content: JSON.stringify({ final_answer: mixed, grounded: true, relevant: true, confidence: 1 }),
    } }] } }) });
  assert.equal(checked.grounded, false);
  assert.equal(checked.escalate, true);
  assert.ok(getRemovalAudit(checked).removed.includes(mixed));
});

test('current staff ownership and investigation claims require application authority', () => {
  for (const claim of [
    'Support is reviewing your request now.',
    'The support team has accepted your case.',
    'A support agent is investigating the problem.',
    'Your case has been accepted by the support team.',
    'Your request is with support now.',
  ]) {
    assert.equal(looksLikeStaffLie(claim), true, claim);
    assert.equal(stripPingNarration(claim), '', claim);
    assert.ok(!escalateReply(claim, { pinged: true }).includes(claim), claim);
  }
});

test('closed uncertainty, negative security policy and unrelated product predictions stay useful', () => {
  for (const text of [
    'I cannot guarantee that the support team will reply in this thread.',
    'I cannot guarantee the support team will reply in this thread.',
    'I cannot guarantee that a person on the team will reply in this thread.',
    'I cannot confirm whether support is reviewing your request.',
    'Support will never ask for your password.',
    'The support team will never ask you for your password or verification code.',
    'A person on the team will never ask for your password.',
    'Recordings are transcribed locally. They will provide searchable text after processing.',
    'Earlier support wrote: “The support team is reviewing your request.”',
    'Earlier, support wrote: “The support team is reviewing your request.”',
    'Earlier support wrote: “A person on the team is reviewing your request.”',
    'Support replied earlier with the completed device check.',
    'Support is reviewing this policy document.',
    'A support agent needs to review your request.',
  ]) {
    assert.equal(looksLikeStaffLie(text), false, text);
    assert.equal(stripStaffLies(text), text, text);
    assert.equal(stripPingNarration(text), text, text);
  }
});

test('a closed disclaimer or security policy cannot exempt an adjoining unsupported claim', () => {
  for (const mixed of [
    'I cannot guarantee that the support team will reply, but support is investigating your case now.',
    'I cannot confirm whether support is reviewing your request; the team will reply tomorrow.',
    'Support will never ask for your password; they will contact you privately soon.',
    'Earlier support wrote: “The check was completed”; support has accepted your request now.',
  ]) {
    const parsed = parseAgentJson(JSON.stringify({ final_answer: mixed, confidence: 1 }));
    assert.ok(getRemovalAudit(parsed).removed.includes(mixed), mixed);
    assert.equal(parsed.final_answer.includes(mixed), false, mixed);
  }
});
