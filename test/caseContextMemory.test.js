const test = require('node:test');
const assert = require('node:assert/strict');
const { createObserver } = require('../supportLearning');
const { createSupportMemory, createMemoryStore } = require('../supportMemory');
const { projectCaseHistory } = require('../caseContext');

const ALICE = '1001';
const BOB = '1002';
const STAFF = '9001';
const BOT = '9999';

function projectMessages(messages, scope) {
  return projectCaseHistory(messages, {
    ...scope,
    botId: BOT,
    isStaff: message => message.author?.id === STAFF && message.member?.verified === true,
  });
}

function fixture(options = {}) {
  const now = Date.now();
  const store = createMemoryStore();
  const policy = { enabled: true, contextEnabled: true, forumIds: ['help'], staffIds: [STAFF], botId: BOT };
  const memory = createSupportMemory({ store, policy, now: () => now });
  const channel = thread('current-post');
  function thread(id, ownerId = ALICE) {
    return { id, ownerId, guildId: 'guild', parentId: 'help', name: 'Fictional recorder question', isThread: () => true };
  }
  function message(id, authorId, content, extra = {}) {
    return {
      id, channel, guildId: 'guild', createdTimestamp: now - 1000,
      author: { id: authorId, username: authorId === ALICE ? 'alice' : authorId === BOB ? 'bob' : authorId === STAFF ? 'support' : 'Mira', bot: authorId === BOT },
      ...(authorId === STAFF ? { member: { verified: true } } : {}),
      content, ...extra,
    };
  }
  function reader(post, messages) {
    const byId = new Map(messages.map(item => [item.id, item]));
    post.messages = { fetch: async request => {
      assert.deepEqual(request, { message: request.message, force: true, cache: false });
      assert.ok(byId.has(request.message), 'only an existing fictional message may be revalidated');
      return byId.get(request.message);
    } };
  }
  const observer = createObserver(memory, options);
  return { now, store, policy, memory, channel, thread, message, reader, observer };
}

test('optional live context projects raw Discord ownership and explicit reply bindings', async () => {
  const { policy, observer, channel, message } = fixture();
  policy.contextEnabled = false;
  const messages = [
    message('owner', ALICE, 'Owner-A supplied a recorder symptom.'),
    message('foreign', BOB, 'Foreign-B supplied a different symptom.'),
    message('staff-owner', STAFF, 'Owner-A bound staff finding.', { reference: { messageId: 'owner' } }),
    message('staff-foreign', STAFF, 'Foreign-B bound staff finding.', { reference: { messageId: 'foreign' } }),
    message('bot-owner', BOT, 'Owner-A bound assistant context.', { reference: { messageId: 'owner' } }),
    message('bot-ambiguous', BOT, 'Ambiguous assistant context.'),
    message('current', ALICE, 'Owner-A current question.'),
  ];
  let calls = 0;
  const rows = await observer.history(channel, 'current', messages, ALICE, (raw, scope) => {
    calls++;
    assert.deepEqual(scope, { customerId: ALICE, excludeId: 'current' });
    assert.equal(raw.find(item => item.id === 'staff-owner').reference.messageId, 'owner');
    assert.equal(raw.find(item => item.id === 'foreign').author.id, BOB);
    return projectMessages(raw, scope);
  });
  assert.equal(calls, 1);
  assert.deepEqual(rows.map(row => row.id), ['bot-owner', 'owner', 'staff-owner']);
  assert.ok(rows.every(row => row.caseContext === 'current_customer' && row.trust === 'conversation_only'));
  assert.doesNotMatch(JSON.stringify(rows), /Foreign-B|Ambiguous|current question/);
});

test('fresh observers revalidate and project retained staff and assistant reply ancestry', async () => {
  const { now, memory, channel, message, reader, observer, store } = fixture();
  const saved = [
    message('owner', ALICE, 'Owner-A previously tried the reversible step.', { createdTimestamp: now - 5000 }),
    message('staff-owner', STAFF, 'Owner-A finding retained for this case.', { createdTimestamp: now - 4000, reference: { messageId: 'owner' } }),
    message('staff-conflict', STAFF, '<@1001> Foreign-B finding must stay with its reply target.', { createdTimestamp: now - 3000, reference: { messageId: 'foreign' } }),
    message('bot-owner', BOT, 'Owner-A assistant reply remains conversation context.', { createdTimestamp: now - 2000, reference: { messageId: 'owner' } }),
    message('bot-ambiguous', BOT, 'Ambiguous assistant finding must not be inherited.'),
  ];
  for (const item of saved) assert.equal(await observer.capture(item), true);
  assert.ok([...store.rows.values()].every(row => row.content === undefined && row.reference === undefined));
  reader(channel, saved);
  const live = [message('foreign', BOB, 'Foreign-B unrelated question.'), message('current', ALICE, 'Owner-A current follow-up.')];
  const rows = await createObserver(memory).history(channel, 'current', live, ALICE, projectMessages);
  assert.deepEqual(rows.map(row => row.id), ['owner', 'staff-owner', 'bot-owner']);
  assert.deepEqual(rows.map(row => row.role), ['customer', 'staff', 'bot']);
  assert.doesNotMatch(JSON.stringify(rows), /Foreign-B|Ambiguous|current follow-up/);
});

test('previous-post summaries preserve owner attempts without foreign or unbound assistant claims', async () => {
  const { now, memory, channel, thread, message, reader, observer } = fixture();
  const previous = thread('previous-owner-post');
  const foreign = thread('previous-foreign-post', BOB);
  const old = [
    message('old-owner-one', ALICE, 'Owner-A first reversible attempt.', { channel: previous, createdTimestamp: now - 4000 }),
    message('old-owner-two', ALICE, 'Owner-A second reversible attempt.', { channel: previous, createdTimestamp: now - 3000 }),
    message('old-bot', BOT, 'Ambiguous assistant claim from the previous post.', { channel: previous, createdTimestamp: now - 2000 }),
  ];
  for (const item of old) assert.equal(await observer.capture(item), true);
  assert.equal(await observer.capture(message('old-peer', BOB, 'Foreign-B prose in the owner post.', { channel: previous })), false);
  assert.equal(await observer.capture(message('foreign-history', BOB, 'Foreign-B separate retained case.', { channel: foreign })), true);
  reader(previous, old);
  channel.client = { channels: { fetch: async (id, options) => {
    assert.equal(id, previous.id);
    assert.deepEqual(options, { force: true, cache: false });
    return previous;
  } } };
  const rows = await createObserver(memory).history(channel, 'current', [message('current', ALICE, 'Owner-A current question.')], ALICE, projectMessages);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source, 'previous_post');
  assert.equal(rows[0].trust, 'conversation_only');
  assert.match(rows[0].content, /Owner-A first reversible attempt/);
  assert.match(rows[0].content, /Owner-A second reversible attempt/);
  assert.doesNotMatch(rows[0].content, /Foreign-B|Ambiguous|Previous bot reply/);
});

test('history timeout and occupied read capacity use the same scoped live fallback', async t => {
  t.mock.method(console, 'error', () => {});
  const { memory, channel, message } = fixture();
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  t.after(release);
  const delayed = createObserver({ ...memory, history: async () => { await blocked; return []; } }, { historyBudgetMs: 15, maxPendingReads: 1 });
  const live = [
    message('owner', ALICE, 'Owner-A current-post context.'),
    message('foreign', BOB, 'Foreign-B current-post context.'),
    message('staff-owner', STAFF, 'Owner-A bound staff context.', { reference: { messageId: 'owner' } }),
    message('staff-foreign', STAFF, 'Foreign-B bound staff context.', { reference: { messageId: 'foreign' } }),
  ];
  const first = delayed.history(channel, 'current', live, ALICE, projectMessages);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(delayed.health().pendingReads, 1);
  const capacityFallback = await delayed.history(channel, 'current', live, ALICE, projectMessages);
  const timeoutFallback = await first;
  for (const rows of [capacityFallback, timeoutFallback]) {
    assert.deepEqual(rows.map(row => row.id), ['owner', 'staff-owner']);
    assert.doesNotMatch(JSON.stringify(rows), /Foreign-B/);
  }
  assert.equal(delayed.health().pendingReads, 1, 'timed-out work retains its capacity until it settles');
  release();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(delayed.health().pendingReads, 0);
});

test('projection cannot bypass the memory owner check or revive opted-out references', async () => {
  const { memory, store, channel, message, reader, observer } = fixture();
  const saved = message('saved-owner', ALICE, 'Owner-A retained attempt before erasure.');
  assert.equal(await observer.capture(saved), true);
  reader(channel, [saved]);
  const live = [message('owner', ALICE, 'Owner-A live context after erasure.'), message('foreign', BOB, 'Foreign-B live context.')];
  assert.deepEqual(await observer.history(channel, 'current', live, BOB, () => {
    assert.fail('owner mismatch must fail before projection');
  }), []);
  assert.equal(await memory.forgetCustomer(memory.scopeFor(channel)), true);
  const rows = await createObserver(memory).history(channel, 'current', live, ALICE, projectMessages);
  assert.deepEqual(rows.map(row => row.id), ['owner']);
  assert.equal(store.rows.size, 0);
  assert.equal(await observer.capture(message('later-owner', ALICE, 'Owner-A must not be retained again.')), false);
  assert.doesNotMatch(JSON.stringify(rows), /Foreign-B|before erasure/);
});
