// Features the owner has switched off for now. Their pages and code stay in
// place (and reachable by URL); only the entry points in the menus are hidden.
export const FEATURES = {
  // Discount codes typed at checkout - hidden for now (owner's call).
  discountCodes: false,
  // The pharmacy's photo of the shipment seal before delivery (psychotropic
  // medicines - not yet; the rep checks the seal for now). Mirrors
  // backend/src/config/features.js.
  deliverySealPhoto: false,
};

// Whether a menu entry tagged with `feature` should be shown.
export function isFeatureShown(feature) {
  return !feature || FEATURES[feature] === true;
}
