const test = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('discord.js');
const { projectCaseHistory } = require('../caseContext');
const { sharedSourceHints } = require('../contextSources');

const CUSTOMER = '100000000000000002';
const STAFF = '100000000000000009';
const BOT = '100000000000000099';
const GUIDE = 'https://docs.omi.me/account/synthetic-sign-in';

function changedProfile(t) {
  // Exercise discord.js's real shared User cache, without logging in or
  // connecting to Discord. Old Message.author references are not snapshots.
  const client = new Client({ intents: [] });
  t.after(() => client.destroy());
  const original = client.users._add({
    id: CUSTOMER, username: 'synthetic_cedar', global_name: 'Cedar',
    discriminator: '0', bot: false,
  });
  const earlier = {
    id: '800000000000000050', createdTimestamp: 50, author: original,
    content: 'I already restarted my desktop application.',
  };
  const finding = {
    id: '800000000000000100', createdTimestamp: 100,
    author: { id: STAFF, username: 'synthetic_staff', bot: false },
    content: `Willow, the account check found CACHED-PROFILE-CANARY. See ${GUIDE}.`,
  };
  const changed = client.users._add({
    id: CUSTOMER, username: 'synthetic_cedar', global_name: 'Willow',
    discriminator: '0', bot: false,
  });
  const current = {
    id: '800000000000000200', createdTimestamp: 200, author: changed,
    content: 'Is there an update for my account?',
  };
  assert.equal(original, changed, 'the installed library reuses its cached User');
  assert.equal(earlier.author.globalName, 'Willow', 'old rows now expose the changed name');
  const options = {
    customerId: CUSTOMER, botId: BOT, excludeId: current.id,
    isStaff: message => message.author.id === STAFF,
  };
  return { earlier, finding, current, options };
}

test('a changed cached profile cannot retrospectively bind a named-only staff finding', t => {
  const { earlier, finding, current, options } = changedProfile(t);
  const messages = [earlier, finding, current];
  assert.deepEqual(projectCaseHistory(messages, options).map(row => row.id), [earlier.id]);
  assert.deepEqual(sharedSourceHints(messages, options), []);
});

test('a stable Discord reply binding remains usable after the cached profile changes', t => {
  const { earlier, finding, current, options } = changedProfile(t);
  finding.reference = { messageId: earlier.id };
  const messages = [earlier, finding, current];
  assert.deepEqual(projectCaseHistory(messages, options).map(row => row.id), [earlier.id, finding.id]);
  assert.deepEqual(sharedSourceHints(messages, options).map(row => row.content), [GUIDE]);
});
