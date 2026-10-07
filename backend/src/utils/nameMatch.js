// Fuzzy matching of a person's or a pharmacy's name, for checking a new
// registration against the pharmacists' syndicate list
// (services/syndicateRegistry.service.js).
//
// Names arrive typed by hand on a phone, so the comparison forgives what a
// person would forgive: a letter too many or too few, أ/ا ة/ه ى/ي, spaces
// inside "عبد الله", the article on a family name, the word "صيدلية" or "د."
// in front, and the father's name written in the middle or left out. It does
// NOT forgive a different first name: "احمد علي" and "محمد علي" are one letter
// apart and two different people, so short names must match exactly (up to
// those spelling conventions) - see tokensMatch.

const { normalizeText } = require('./normalizeText');

// Words that say "pharmacy" or "doctor" rather than whose pharmacy it is.
// Compared after normalizeText, so these are in its output form (ة -> ه ...).
const NOISE_WORDS = new Set([
  'صيدليه', 'الصيدليه', 'صيدلاني', 'الصيدلاني', 'صيدلانيه', 'الصيدلانيه',
  'ص', 'د', 'دكتور', 'الدكتور', 'دكتوره', 'الدكتوره', 'الدكتورة',
  'pharmacy', 'pharmacie', 'ph', 'dr', 'doctor',
]);

// Letters whose presence or absence is a spelling habit, not a different name:
// داود/داوود, ياسمن/ياسمين, عصفوري/عصيفوري (after normalizeText).
const WEAK_LETTERS = new Set(['ا', 'و', 'ي', 'ه']);

// True when the longer word is the shorter one with weak letters added - and
// only added: "علا" and "علي" swap one for another and are two names.
function differsOnlyByWeakLetters(a, b) {
  if (a.length === b.length) return false;
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  if (short.length < 2) return false;
  let i = 0;
  for (const ch of long) {
    if (i < short.length && short[i] === ch) i += 1;
    else if (!WEAK_LETTERS.has(ch)) return false;
  }
  return i === short.length;
}

// سلمى/سلما, رولا/رولي: a final alef for a final ya - long enough names only.
function finalAlefYaSwap(a, b) {
  if (a.length !== b.length || a.length < 4) return false;
  const endA = a[a.length - 1];
  const endB = b[b.length - 1];
  return a.slice(0, -1) === b.slice(0, -1) && endA !== endB && 'اي'.includes(endA) && 'اي'.includes(endB);
}

function stripArticle(token) {
  return token.length > 4 && token.startsWith('ال') ? token.slice(2) : token;
}

// "عبد الله" and "عبدالله" are the same name; so are "ابو علي" and "ابوعلي".
function joinCompounds(tokens) {
  const out = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if ((token === 'عبد' || token === 'ابو') && i + 1 < tokens.length) {
      out.push(token + tokens[i + 1]);
      i += 1;
    } else {
      out.push(token);
    }
  }
  return out;
}

function nameTokens(value) {
  const text = normalizeText(value).replace(/ء/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ');
  const tokens = text.split(/\s+/).filter((t) => t && !NOISE_WORDS.has(t));
  return joinCompounds(tokens);
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return prev[b.length];
}

// One word against another, as a closeness from 0 (different words) to 1:
//   1     the same word (after normalization)
//   0.97  the same without the article ("السليمان"/"سليمان")
//   0.95  give or take weak letters ("ياسمن"/"ياسمين", "سلمى"/"سلما")
//   0.85  one slip in a long word - only long ones, where a single letter
//         cannot turn one common name into another ("احمد"/"محمد" stay apart)
//   0.75  two slips in a very long word
// These feed the match percentage the admin sets a minimum for.
function tokenSimilarity(a, b) {
  if (a === b) return 1;
  const x = stripArticle(a);
  const y = stripArticle(b);
  if (x === y) return 0.97;
  if (differsOnlyByWeakLetters(x, y) || finalAlefYaSwap(x, y)) return 0.95;
  const shorter = Math.min(x.length, y.length);
  if (shorter >= 5 && levenshtein(x, y) <= 1) return 0.85;
  if (shorter >= 8 && levenshtein(x, y) <= 2) return 0.75;
  return 0;
}

function tokensMatch(a, b) {
  return tokenSimilarity(a, b) > 0;
}

// Each extra word the list cannot explain (a grandfather's name, say) costs this share.
const UNEXPLAINED_WORD_FACTOR = 0.9;

// How well a typed name matches a listed person.
//
//   listed:  the name on the list, e.g. "عمار شغري" or "العصماء جابر محمد"
//   father:  the father's name on the list - may sit in the middle of either
//            name, or be missing from either, without counting against it
//   typed:   what the user wrote
//
// Returns { full, ratio, score }:
//   full  - every part of the listed name is there, the first names agree,
//           and the typed name adds at most one word the list doesn't explain
//   ratio - share of the listed name's parts that were found (0..1)
//   score - how closely: the found parts' closeness averaged over the whole
//           listed name, less 10% per unexplained extra word (0..1)
function personMatch(typed, listed, father = '') {
  return personMatchTokens(nameTokens(typed), nameTokens(listed), nameTokens(father));
}

// personMatch on names already split by nameTokens - the registry check
// splits the typed name once and the list's names once per upload.
function personMatchTokens(input, target, fatherTokens) {
  if (input.length === 0 || target.length === 0) return { full: false, ratio: 0, score: 0 };

  const isFather = (token) => fatherTokens.some((f) => tokensMatch(token, f));
  // A middle word on the list that is the father's name is optional.
  const required = target.filter((token, i) => !(target.length >= 3 && i > 0 && i < target.length - 1 && isFather(token)));

  // Each listed part takes the closest typed word still free.
  const used = new Array(input.length).fill(false);
  let found = 0;
  let closeness = 0;
  required.forEach((token) => {
    let at = -1;
    let best = 0;
    input.forEach((candidate, i) => {
      if (used[i]) return;
      const similarity = tokenSimilarity(candidate, token);
      if (similarity > best) {
        best = similarity;
        at = i;
      }
    });
    if (at !== -1) {
      used[at] = true;
      found += 1;
      closeness += best;
    }
  });

  const ratio = found / required.length;
  const firstNamesAgree = tokensMatch(input[0], required[0]);
  const unexplained = input.filter((token, i) => !used[i] && !isFather(token)).length;
  const full = found === required.length && firstNamesAgree && unexplained <= 1 && required.length >= 2;
  const score = (closeness / required.length) * UNEXPLAINED_WORD_FACTOR ** unexplained;
  return { full, ratio, score };
}

// A pharmacy's own name ("صيدلية الشفاء") against the listed one. Common
// names repeat across the city, so this only ever supports a decision.
function pharmacyNameMatch(typed, listed) {
  return pharmacyNameMatchTokens(nameTokens(typed), nameTokens(listed));
}

function pharmacyNameMatchTokens(input, target) {
  if (input.length === 0 || target.length === 0) return false;
  if (input.length !== target.length) return false;
  return input.every((token, i) => tokensMatch(token, target[i]));
}

// The last nine digits of a Syrian mobile number - the same for 09..., 9639...
// and +9639..., which is how the list and the app may each have written it.
function phoneKey(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length >= 9 ? digits.slice(-9) : '';
}

module.exports = {
  nameTokens,
  tokenSimilarity,
  tokensMatch,
  personMatch,
  personMatchTokens,
  pharmacyNameMatch,
  pharmacyNameMatchTokens,
  phoneKey,
  levenshtein,
};
