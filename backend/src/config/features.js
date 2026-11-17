// Features the owner has switched off for now. The code behind each stays in
// place and tested; flipping the switch brings the feature back.
const FEATURES = {
  // The pharmacy's photo of the shipment seal, which a warehouse could require
  // before an order counts as delivered. It exists for psychotropic medicines,
  // which Feniq is not taking on yet, and checking the seal is the rep's job
  // for now (owner's call, October 2026). Off: no order asks for the photo and
  // none is held back waiting for one - including orders created while it was on.
  deliverySealPhoto: false,
  // Closing an order left on the road as delivered (and charging it) on its
  // own a day after it left - warehouseOrder.service.js autoDeliverStaleOrders,
  // run hourly from server.js. Off (owner's call, 2026-11-17): an order is
  // delivered only when the manager or the accountant marks it, and they
  // decide then how it is paid - cash, on credit, or part of it.
  autoDelivery: false,
  // The manager's "marked delivered automatically in X hours" countdown on an
  // order on the road (autoDeliverAt on the warehouse order responses). Off
  // (owner's call, 2026-11-17): delivery times can't be promised yet, and what
  // the manager needs first is when the pharmacy settles. Display only - the
  // hourly auto-delivery is its own switch above; the countdown is never
  // shown while that is off. On: the app shows it again with no new release
  // (it shows whatever the server sends).
  autoDeliverCountdown: false,
};

module.exports = { FEATURES };
