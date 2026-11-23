const test = require('node:test');
const assert = require('node:assert/strict');
const { technicalReviewSafety } = require('../commandcode');
const evidence = '[S1 | Official Help Center]\nhttps://help.omi.me/qa-custody\nKeep the app installed; do not uninstall, reinstall, sign out or clear recording storage while recordings are unsynced.';
const check = (body, language = 'hi-Latn') => technicalReviewSafety(body, 'tech', evidence, ['S1'], { language, dataLossRisk: true });

test('romanized Hindi postposed prohibitions retain the complete custody warning', () => {
  for (const body of [
    'App uninstall mat karein. Local recordings bachayein.',
    'App reinstall na karein, sign out na karein, aur clear recordings na karein.',
    'Abhi sign out ya reinstall na karein — warna unsynced recordings kho sakti hain.',
    'Log out aur uninstall nahi karna. App version note kar lein.',
  ]) {
    const result = check(body);
    assert.equal(result.safe, true, body);
    assert.equal(result.answer, body);
  }
});

test('a Hindi negative clause cannot exempt a separate positive destructive action', () => {
  for (const body of [
    'Reinstall karein, sign out na karein.',
    'Sign out na karein; uninstall the app.',
    'Reinstall karein aur baad mein na karein boliye.',
    'Uninstall na karein, then clear recordings.',
    'Reinstall na karein — clear all storage.',
  ]) {
    assert.equal(check(body).safe, false, body);
  }
  assert.equal(check('Reinstall na karein.', 'en').safe, false, 'do not infer locale from a convenient suffix');
});
