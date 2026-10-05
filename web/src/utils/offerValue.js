// What an exceptional offer gives, as one short label: "15%" for a discount,
// "بونص 10+3" for a better bonus at the same price.
export function offerValueLabel(offer, t) {
  if (offer?.offerType === 'bonus') {
    const bonus = (offer.bonuses ?? []).map((tier) => `${tier.buy}+${tier.free}`).join('، ');
    return t('offers.warehouse.bonusValue', { bonus });
  }
  return `${offer?.discountPercentage ?? 0}%`;
}
