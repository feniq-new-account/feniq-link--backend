// Features the owner has switched off for now. The code behind each stays in
// place and tested; flipping the switch brings the feature back.
const FEATURES = {
  // The pharmacy's photo of the shipment seal, which a warehouse could require
  // before an order counts as delivered. It exists for psychotropic medicines,
  // which Feniq is not taking on yet, and checking the seal is the rep's job
  // for now (owner's call, October 2026). Off: no order asks for the photo and
  // none is held back waiting for one - including orders created while it was on.
  deliverySealPhoto: false,
};

module.exports = { FEATURES };
