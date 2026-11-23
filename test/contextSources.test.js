const test = require('node:test');
const assert = require('node:assert/strict');
const { sharedSourceHints, sourceHintUrls } = require('../contextSources');
const { relevantDocs, storedDocs } = require('../docs');

const guide = 'https://docs.omi.me/user-guide/synthetic-pairing';
const staff = content => ({ id: 'staff-message', author: { id: 'staff', bot: false }, content, createdTimestamp: 10 });
const options = { customerId: '2002', botId: 'mira', isStaff: message => message.author.id === 'staff' };

test('shared staff prose is withheld; only clean public source pointers survive', () => {
  const rows = sharedSourceHints([staff(`FOREIGN-ACCOUNT-CANARY. See ${guide}. https://private.example/ticket/secret https://help.omi.me/en/articles/123-guide?account=secret`)], options);
  assert.deepEqual(rows.map(row => row.content), [guide]);
  assert.equal(rows[0].role, 'source_hint');
  assert.deepEqual(sharedSourceHints([{ ...staff(guide), webhookId: 'webhook' }], options), []);
  assert.deepEqual(sharedSourceHints([{ ...staff(guide), author: { id: 'peer' } }], options), []);
  assert.deepEqual(sourceHintUrls(['https://docs.omi.me@private.example/secret', 'https://docs.omi.me.evil.example/guide', `${guide}#private`, `${guide}?token=secret`]), []);
  assert.deepEqual(sharedSourceHints([staff(guide)], { ...options, isStaff: () => Promise.resolve(true) }), []);
  assert.deepEqual(sharedSourceHints([staff(guide)], { ...options, isStaff: () => { throw Error('unavailable'); } }), []);
});

test('a foreign or ambiguous provider-specific staff link cannot become shared guidance', () => {
  const alice = { id: 'a', createdTimestamp: 1, author: { id: '2001', username: 'Alice', bot: false }, content: 'Google sign-in fails.' };
  const bob = { id: 'b', createdTimestamp: 2, author: { id: '2002', username: 'Bob', bot: false }, content: 'Apple sign-in fails.' };
  const google = 'https://docs.omi.me/google/synthetic-sign-in';
  assert.deepEqual(sharedSourceHints([alice, bob, staff(`Alice, see ${google} for the Google issue.`)], options), []);
  assert.deepEqual(sharedSourceHints([alice, bob, staff(`Alice and Bob, see ${google}.`)], options), []);
  assert.deepEqual(sharedSourceHints([alice, bob, { ...staff(`Bob, see ${guide}.`), reference: { messageId: bob.id } }], options).map(row => row.content), [guide]);
});

test('a staff pointer retrieves catalog evidence rather than becoming evidence itself', async () => {
  const reads = [], sources = [];
  const evidence = await relevantDocs('How do I pair an Omi?', { store: {}, sourceHints: [guide, 'https://docs.omi.me/not-in-catalog'],
    onSources: urls => sources.push(...urls),
    fetchImpl: async url => {
      reads.push(url);
      return { ok: true, text: async () => url.endsWith('/llms.txt')
        ? [1, 2, 3].map(index => `[Pair an Omi](https://docs.omi.me/user-guide/synthetic-pair-${index}): Pair a device`).join('\n') +
          `\n[Pair an Omi](${guide}): Pair a device`
        : 'To pair your Omi, open the Omi app and select the device. Synthetic official pairing guidance.' };
    },
  });
  assert.ok(reads.includes(guide));
  assert.ok(!reads.some(url => url.includes('not-in-catalog')));
  assert.match(evidence, /Synthetic official pairing guidance/);
  assert.ok(sources.includes(guide));
});

test('stored source pointers cannot add a similarly worded unrelated page', async () => {
  const foreign = { url: 'https://docs.omi.me/user-guide/synthetic-other', title: 'Pairing', body: 'FOREIGN-CATALOG-CANARY', source: 'docs', rank: 1 };
  const evidence = await storedDocs('How do I pair an Omi?', {
    searchDocPages: async query => query === guide ? [foreign] : [],
  }, [], { sourceHints: [guide] });
  assert.doesNotMatch(evidence, /FOREIGN-CATALOG-CANARY/);
});

test('an unrelated shared source cannot displace current-question catalog selection', async t => {
  const now = Date.now();
  t.mock.method(Date, 'now', () => now + 2 * 60 * 60 * 1000);
  const unrelated = 'https://docs.omi.me/finance/synthetic-tax';
  const reads = [];
  await relevantDocs('How do I pair an Omi?', { store: {}, sourceHints: [unrelated], fetchImpl: async url => {
    reads.push(url);
    return { ok: true, text: async () => url.endsWith('/llms.txt')
      ? `[Pairing](${guide}): Pair an Omi\n[Tax](${unrelated}): Financial rules`
      : 'Open the Omi app to pair an Omi device.' };
  } });
  assert.ok(reads.includes(guide));
  assert.ok(!reads.includes(unrelated));
});
