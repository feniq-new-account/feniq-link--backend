// The name a record is shown by: its Arabic name. The English one is only a
// fallback for a record that has no Arabic name (a medicine always has one -
// the English name of a medicine is a search helper and is never shown), and
// '-' rather than a blank when neither exists.
//
// (en, ar) - the argument order every call site has always used.
function clean(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

export function displayName(en, ar) {
  return clean(ar) || clean(en) || '-';
}
