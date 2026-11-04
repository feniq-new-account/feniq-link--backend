function serializeUser(user) {
  return {
    id: user._id,
    name: user.name,
    phone: user.phone,
    role: user.role,
    ...(user.role === 'warehouse' ? { warehouseRole: user.warehouseRole || 'legacy' } : {}),
    status: user.status,
    lang: user.lang,
  };
}

// Legacy rows created before areaType existed still have no value for it -
// pharmacy.model.js made it `required: true`, but that only constrains WRITES,
// and scripts/backfill-pharmacy-area-type.js has not necessarily run on every
// deployment yet. A missing value serialises to `undefined`, JSON.stringify
// drops the key entirely, and PharmacyModel.fromJson's `json['areaType'] as
// String` then throws a TypeError that auth_cubit.dart's `on Failure catch`
// does not catch - so the pharmacy app hangs on the login spinner with no
// error at all, for exactly the accounts that predate the field.
//
// Matches the backfill script's own choice of default for the same "we never
// collected this from old pharmacies" case. Keep this even after the backfill
// runs: it is what stops one un-migrated row from locking a real user out.
const DEFAULT_AREA_TYPE = 'city';

function serializePharmacy(pharmacy) {
  if (!pharmacy) return null;
  return {
    id: pharmacy._id,
    nameAr: pharmacy.nameAr,
    nameEn: pharmacy.nameEn,
    ownerName: pharmacy.ownerName,
    address: pharmacy.address,
    areaName: pharmacy.areaName || '',
    location: pharmacy.location || null,
    locationApproval: pharmacy.locationApproval || 'pending',
    city: pharmacy.city,
    areaType: pharmacy.areaType || DEFAULT_AREA_TYPE,
    phone: pharmacy.phone,
    verificationPhoto: pharmacy.verificationPhoto,
  };
}

function serializeWarehouse(warehouse) {
  if (!warehouse) return null;
  return {
    id: warehouse._id,
    nameAr: warehouse.nameAr,
    nameEn: warehouse.nameEn,
    city: warehouse.city,
    phone: warehouse.phone,
    logo: warehouse.logo,
  };
}

// The signed-in user's own view: serializeUser plus mustChangePassword, which
// the pharmacy app uses to force the change-password screen after an admin
// reset. Kept out of serializeUser itself because the admin account lists
// share that one and have no use for it. Strictly boolean - a row that predates
// the field reads as false.
function serializeSelf(user) {
  return { ...serializeUser(user), mustChangePassword: user.mustChangePassword === true };
}

// `refreshToken` is only present on responses that actually start or renew
// a session (register / login / refresh); getMe has none to give, which is
// why toMeResponse is a separate shape rather than a flag on this one.
function toAuthResponse({ user, pharmacy, warehouse, token, refreshToken }) {
  return {
    token,
    refreshToken,
    user: serializeSelf(user),
    pharmacy: serializePharmacy(pharmacy),
    warehouse: serializeWarehouse(warehouse),
  };
}

function toMeResponse({ user, pharmacy, warehouse }) {
  return {
    user: serializeSelf(user),
    pharmacy: serializePharmacy(pharmacy),
    warehouse: serializeWarehouse(warehouse),
  };
}

module.exports = {
  toAuthResponse,
  toMeResponse,
  serializeUser,
  serializePharmacy,
  serializeWarehouse,
};
