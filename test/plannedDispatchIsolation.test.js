const test = require('node:test');
const assert = require('node:assert/strict');
const { reviewAnswer } = require('../commandcode');
const { approvedReview, reviewWithSecondLook } = require('../reviewDecision');
const { getRemovalAudit } = require('../answerFilterAudit');

const source = '[S1 | Official Help Center]\nhttps://help.omi.me/qa-search\nRemove the active search filter and try one short search. This changes displayed results, not stored recordings. If it still freezes, provide the app version. Do not uninstall or clear recording storage.';
const useful = 'Search still freezes after your phone restart. Remove the active search filter and try one short search. This changes displayed results, not stored recordings. Do not uninstall or clear recording storage. What app version do you use?';
const postResult = answer => async () => ({ data: { choices: [{ message: { content: JSON.stringify({
  final_answer: answer, grounded: true, relevant: true, confidence: 0.9,
  escalate: true, sources_used: ['S1'],
}) } }] } });
const args = { question: 'Search freezes after a phone restart. Please have a person review it. What can I safely try?',
  threadHistory: [], draft: useful, sources: source, lane: 'tech', handoffPlanned: true };

test('a separate planned-dispatch announcement cannot discard reviewed sourced help', async () => {
  for (const notice of [
    'I’ll pass this to a person for review.',
    'I will forward your report to the support team.',
    'I am going to send your request to our engineers for review.',
    'I will hand it over to staff.',
  ]) {
    let calls = 0;
    const chosen = await reviewWithSecondLook(args, { log: () => {}, review: input => {
      calls++;
      return reviewAnswer({ ...input, post: postResult(`${useful.split('. ')[0]}. ${notice} ${useful.split('. ').slice(1).join('. ')}`) });
    } });
    assert.equal(approvedReview(chosen), true, notice);
    assert.equal(calls, 1, 'no extra model stage is needed for disposable routing boilerplate');
    assert.match(chosen.final_answer, /Remove the active search filter/);
    assert.match(chosen.final_answer, /phone restart/);
    assert.match(chosen.final_answer, /Do not uninstall/);
    assert.match(chosen.final_answer, /app version/);
    assert.match(chosen.final_answer, /https:\/\/help\.omi\.me\/qa-search/);
    assert.doesNotMatch(chosen.final_answer, /I(?:’ll| will| am going to) (?:pass|forward|send|hand)/);
    assert.deepEqual(getRemovalAudit(chosen).removed, []);
  }
});

test('mixed, dependent, completed and staff-response claims still invalidate review', async () => {
  for (const unsafe of [
    'I’ll pass this to a person for review, so you can clear storage.',
    'I’ll pass this to a person for review; you can clear storage.',
    'I’ll pass this to a person for review. They will reply tomorrow.',
    'I’ll pass this to a person for review. Only then clear storage.',
    'I’ll pass this to a person for review. That confirms your backup.',
    'I have forwarded your report to the support team.',
    'I’ll send your refund to the team.',
    'I’ll pass this to a person for review and guarantee a response.',
    'I’ll pass this to a person for review if the upload finishes.',
    'The support team will reply to you.',
    'A person on the team is reviewing your case.',
  ]) {
    const checked = await reviewAnswer({ ...args, post: postResult(`${unsafe}\n\n${useful}`) });
    assert.equal(approvedReview(checked), false, unsafe);
    assert.ok(getRemovalAudit(checked).removed.length, unsafe);
    assert.equal(checked.escalate, true);
  }
});

test('no dispatch isolation without an application-planned handoff or a positive review', async () => {
  const notice = 'I’ll pass this to a person for review.';
  const unplanned = await reviewAnswer({ ...args, handoffPlanned: false, post: postResult(`${notice} ${useful}`) });
  assert.equal(approvedReview(unplanned), false);
  const rejected = await reviewAnswer({ ...args, post: async () => ({ data: { choices: [{ message: {
    content: JSON.stringify({ final_answer: `${notice} ${useful}`, grounded: false, relevant: true, sources_used: ['S1'] }),
  } }] } }) });
  assert.equal(approvedReview(rejected), false);
});
