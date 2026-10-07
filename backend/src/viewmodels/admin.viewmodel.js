const { serializeUser, serializePharmacy, serializeWarehouse } = require('./auth.viewmodel');

// The admin lists add what the registration's syndicate-list check found
// (pharmacy.model.js syndicateMatch) - admin-only, so it is spread on here
// rather than added to the shared serializePharmacy behind every auth response.
function serializeSyndicateMatch(match) {
  if (!match || !match.decision) return null;
  return {
    decision: match.decision,
    score: match.score,
    reasons: match.reasons || [],
    pharmacistName: match.pharmacistName,
    fatherName: match.fatherName,
    pharmacyName: match.pharmacyName,
    region: match.region,
    place: match.place,
    phones: match.phones || [],
  };
}

function serializeAdminPharmacy(pharmacy) {
  const base = serializePharmacy(pharmacy);
  return base ? { ...base, syndicateMatch: serializeSyndicateMatch(pharmacy.syndicateMatch) } : null;
}

function toPendingAccountItem({ user, pharmacy, warehouse }) {
  return {
    user: serializeUser(user),
    pharmacy: serializeAdminPharmacy(pharmacy),
    warehouse: serializeWarehouse(warehouse),
  };
}

function toPendingAccountsResponse(items) {
  return { accounts: items.map(toPendingAccountItem) };
}

// The Accounts management page needs the same {user, pharmacy, warehouse} shape
// plus the account's creation date for its "Created" column. `createdAt` is not
// part of the shared serializeUser (it's dead weight on every auth response), so
// it's spread on here from the lean User the service already selected it onto.
function toAccountItem({ user, pharmacy, warehouse }) {
  return {
    user: { ...serializeUser(user), createdAt: user.createdAt },
    pharmacy: serializeAdminPharmacy(pharmacy),
    warehouse: serializeWarehouse(warehouse),
  };
}

function toAccountsResponse(items) {
  return { accounts: items.map(toAccountItem) };
}

module.exports = { toPendingAccountsResponse, toAccountsResponse };
