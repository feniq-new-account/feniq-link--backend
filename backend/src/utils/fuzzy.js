// String similarity for the import's "did you mean" suggestions (catalog
// overhaul §4.4). There is no external search engine, so candidates are
// narrowed with indexed queries first and only then scored here, in memory,
// over a bounded set.
//
// Trigram Dice similarity on already-normalized text (utils/normalizeText.js):
// each string is padded with spaces and cut into overlapping 3-character
// pieces; the score is 2*|shared| / (|a| + |b|), from 0 (nothing in common)
// to 1 (identical). Robust to typos, missing letters and word order.

function trigrams(text) {
  const padded = `  ${text} `;
  const grams = new Map();
  for (let i = 0; i < padded.length - 2; i += 1) {
    const gram = padded.slice(i, i + 3);
    grams.set(gram, (grams.get(gram) ?? 0) + 1);
  }
  return grams;
}

function trigramSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const left = trigrams(a);
  const right = trigrams(b);
  let shared = 0;
  let total = 0;
  for (const [gram, count] of left) {
    total += count;
    shared += Math.min(count, right.get(gram) ?? 0);
  }
  for (const count of right.values()) total += count;
  return total === 0 ? 0 : (2 * shared) / total;
}

module.exports = { trigramSimilarity };
