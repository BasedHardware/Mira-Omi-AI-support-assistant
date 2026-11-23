const test = require('node:test');
const assert = require('node:assert/strict');
const router = require('../router');
const plannerPolicy = require('../plannerPolicy');
const { routeForRequest } = require('../requestRouting');

const history = (...contents) => contents.map(content => ({
  author: 'customer', role: 'customer', caseContext: 'current_customer', content,
}));

test('physical charged predicates do not become payment requests', () => {
  for (const question of [
    'My pendant is fully charged. Do I need to disconnect Bluetooth before setup?',
    'I charged the battery overnight; the device still will not pair.',
    'The recorder has already been charged, but its light stays off.',
    'No, I mean battery charging, not a payment.',
  ]) assert.notEqual(router.classify(question).lane, 'money', question);
});

test('transaction charges remain protected even beside physical charging', () => {
  for (const question of [
    'I was charged twice for my recorder.',
    'The battery is charged, but my card was charged twice.',
    'My Omi was charged to my card again.',
    'My device was charged $29.',
    'My device was charged at $29.',
    'I charged the battery, and I want a refund.',
    'The payment failed while my pendant was charging.',
  ]) assert.equal(router.classify(question).lane, 'money', question);
});

test('a concrete current subject beats an old title and commercial history', () => {
  const prior = history('I have a subscription question.', 'I restarted the iPhone app but it still crashes.');
  assert.equal(routeForRequest('My Android app crashes when opening Tasks.', {
    history: prior, title: 'Paid subscription',
  }).area, 'app');
  const visibility = routeForRequest('Was this forum post removed?', { history: prior, title: 'Subscription' });
  assert.equal(visibility.lane, 'unknown', 'unknown current subjects go to understanding, not a historical payment lock');
  assert.equal(routeForRequest('This post disappeared; can you check?', { history: prior, title: 'Subscription' }).lane, 'unknown');
  assert.equal(routeForRequest('No, I asked whether my post is visible.', { history: prior, title: 'Subscription' }).lane, 'unknown');
});

test('an elliptical follow-up inherits the latest owned subject without merging every old topic', () => {
  const prior = history('I want a refund.', 'The Android app crashes after opening Tasks.');
  const route = routeForRequest('It still happens.', { history: prior, title: 'Refund' });
  assert.equal(route.area, 'app');
  assert.equal(route.lane, 'tech');
  assert.equal(routeForRequest('Any update?', { history: history('I was charged twice.') }).lane, 'money');
  assert.equal(routeForRequest('Any update?', { history: history('Delete my account.') }).lane, 'privacy');
  assert.equal(routeForRequest('Any update?', { title: 'My Android app crashes.' }).lane, 'tech');
  assert.equal(routeForRequest('Does that remove the phone copy?', { history: history('How do I delete a past conversation and its phone recording?') }).lane, 'faq');
});

test('battery wording does not replace an explicit phone app subject', () => {
  assert.equal(router.classify('The Omi app drains my iPhone battery.').area, 'app');
  assert.equal(router.classify('My pendant battery no longer charges.').area, 'firmware');
});

test('history cannot supply current human intent or borrow another customer topic', () => {
  const prior = [...history('The app crashes on Android; I need a real person.'),
    { author: 'customer', role: 'customer', caseContext: 'other_customer', content: 'I want a refund.' }];
  const route = routeForRequest('It still happens.', { history: prior });
  assert.equal(route.lane, 'tech');
  assert.equal(route.wantHuman, false);
  assert.equal(routeForRequest('I need a person.', { history: prior }).wantHuman, true);
});

test('understanding can correct inherited commercial context while explicit current actions remain locked', () => {
  const understanding = { supportKind: 'technical_problem', standaloneQuestion: 'The Android app still crashes.', wantsPerson: true };
  const oldRoute = { area: 'shop', lane: 'money', escalate: true, wantHuman: false };
  assert.equal(plannerPolicy.routeWithUnderstanding(oldRoute, understanding, 'I am still waiting for help.').lane, 'tech');
  for (const question of ['I want a refund for the app crash.', 'Delete my account; it crashes.', 'I was charged twice.']) {
    const explicit = router.classify(question);
    assert.equal(plannerPolicy.routeWithUnderstanding(explicit, understanding, question).lane, explicit.lane, question);
    assert.equal(plannerPolicy.routeWithUnderstanding(explicit, { supportKind: 'order_lookup' }, question).lane, explicit.lane, question);
  }
});
