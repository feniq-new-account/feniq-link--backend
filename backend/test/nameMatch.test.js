// utils/nameMatch.js - how forgiving the syndicate-list check is with names
// typed by hand, and where it stops forgiving.
const test = require('node:test');
const assert = require('node:assert');
const { nameTokens, tokensMatch, personMatch, pharmacyNameMatch, phoneKey } = require('../src/utils/nameMatch');

test('drops the words that say "pharmacy" or "doctor"', () => {
  assert.deepStrictEqual(nameTokens('صيدلية د. عمار شغري'), ['عمار', 'شغري']);
  assert.deepStrictEqual(nameTokens('الصيدلانية آلاء'), ['الا']);
});

test('joins "عبد الله" written with or without the space', () => {
  assert.deepStrictEqual(nameTokens('عبد الله سليمان'), nameTokens('عبدالله سليمان'));
});

test('one word: spelling conventions and long-word typos match, short different names do not', () => {
  assert.ok(tokensMatch('داود', 'داوود'));
  assert.ok(tokensMatch('السليمان', 'سليمان'));
  assert.ok(tokensMatch('ياسمن', 'ياسمين'));
  assert.ok(tokensMatch('عصيفوري', 'عصفوري'));
  assert.ok(!tokensMatch('احمد', 'محمد'), 'Ahmad and Mohammad are different people');
  assert.ok(!tokensMatch('علا', 'علي'));
});

test('the listed name is found with "صيدلية" in front, a typo, or the father in the middle', () => {
  const listed = ['ياسمين شغري', 'سمير'];
  for (const typed of ['ياسمين شغري', 'صيدلية ياسمين شغري', 'د. ياسمين سمير شغري', 'ياسمن شغري', 'ياسمين شغرى']) {
    assert.ok(personMatch(typed, ...listed).full, typed);
  }
});

test('a father listed in the middle of the name may be left out', () => {
  assert.ok(personMatch('العصماء محمد', 'العصماء جابر محمد', 'جابر').full);
});

test('a different first name, a missing family name or a swapped order is not a match', () => {
  assert.ok(!personMatch('محمد شغري', 'ياسمين شغري', 'سمير').full);
  assert.ok(!personMatch('ياسمين', 'ياسمين شغري', 'سمير').full);
  assert.ok(!personMatch('شغري ياسمين', 'ياسمين شغري', 'سمير').full);
  assert.strictEqual(personMatch('ياسمين', 'ياسمين شغري', 'سمير').ratio, 0.5);
});

test('pharmacy names compare word for word', () => {
  assert.ok(pharmacyNameMatch('صيدلية الشفاء', 'الشفاء'));
  assert.ok(!pharmacyNameMatch('صيدلية الشفاء الحديثة', 'الشفاء'));
});

test('phone numbers compare on the last nine digits', () => {
  assert.strictEqual(phoneKey('0933875838'), phoneKey('+963933875838'));
  assert.strictEqual(phoneKey('963 933 875 838'), '933875838');
  assert.strictEqual(phoneKey('12345'), '');
});

test('a final alef for a final ya is forgiven on longer names only', () => {
  const one = (name) => nameTokens(name)[0];
  assert.ok(tokensMatch(one('سلمى'), one('سلما')));
  assert.ok(!tokensMatch(one('علا'), one('علي')));
});
