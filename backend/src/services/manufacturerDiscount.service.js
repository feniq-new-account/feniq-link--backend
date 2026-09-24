const mongoose = require('mongoose');
const { ApiError } = require('../utils/ApiError');
const ManufacturerDiscount = require('../models/manufacturerDiscount.model');
const Manufacturer = require('../models/manufacturer.model');
const WarehouseManufacturer = require('../models/warehouseManufacturer.model');
const { normalizeText } = require('../utils/normalizeText');

async function listDiscountsForWarehouse(warehouseId) {
  // manufacturerDiscount.viewmodel.js's serializeDiscount reads id/
  // manufacturerId/manufacturerAr/discountPercentage/createdAt.
  return ManufacturerDiscount.find({ warehouseId })
    .select('manufacturerId manufacturerAr discountPercentage createdAt')
    .sort({ manufacturerAr: 1 });
}

// Any value > 0 and <= 100, decimals allowed (2.5 is a real discount). The
// model carries the exact same bound, so a value this accepts can never turn
// into a Mongoose ValidationError (the old 0.5 -> HTTP 500, L2).
function validatePercentage(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 100) {
    throw ApiError.badRequest(
      'Discount percentage must be greater than 0 and at most 100.',
      undefined,
      'INVALID_DISCOUNT_PERCENTAGE'
    );
  }
}

// Section 15 (follow-up): validated against the warehouse's manufacturer
// registry (populated by Excel imports, see warehouseManufacturer.service.js)
// rather than derived live from current products - sticky, so a discount
// stays creatable/editable for a manufacturer even if its products are
// temporarily all removed. Never free text either way.
//
// The caller may name the manufacturer by id (manufacturerId) or by name
// (manufacturerAr, what the Discounts page sends) - a name is resolved through
// its normalized key, so a spelling variant still finds the one Manufacturer.
async function resolveRegisteredManufacturer(warehouseId, { manufacturerId, manufacturerAr }) {
  let manufacturer = null;
  if (typeof manufacturerId === 'string' && mongoose.Types.ObjectId.isValid(manufacturerId)) {
    manufacturer = await Manufacturer.findById(manufacturerId).select('nameAr').lean();
  } else if (typeof manufacturerAr === 'string' && manufacturerAr.trim()) {
    manufacturer = await Manufacturer.findOne({ key: normalizeText(manufacturerAr) }).select('nameAr').lean();
  } else {
    throw ApiError.badRequest('Invalid manufacturer.', undefined, 'INVALID_MANUFACTURER');
  }

  const registered =
    manufacturer &&
    (await WarehouseManufacturer.exists({ warehouseId, manufacturerId: manufacturer._id }));
  if (!registered) {
    throw ApiError.badRequest(
      'This manufacturer is not in your catalog.',
      undefined,
      'INVALID_MANUFACTURER'
    );
  }
  return manufacturer;
}

async function createDiscount(warehouseId, data) {
  const manufacturer = await resolveRegisteredManufacturer(warehouseId, data);
  validatePercentage(data.discountPercentage);

  try {
    return await ManufacturerDiscount.create({
      warehouseId,
      manufacturerId: manufacturer._id,
      manufacturerAr: manufacturer.nameAr,
      discountPercentage: data.discountPercentage,
    });
  } catch (err) {
    if (err.code === 11000) {
      throw ApiError.conflict(
        'You already have a discount set for this manufacturer.',
        'DISCOUNT_ALREADY_EXISTS'
      );
    }
    throw err;
  }
}

async function findOwnedDiscountOrThrow(id, warehouseId) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw ApiError.notFound('Discount not found.', 'DISCOUNT_NOT_FOUND');
  }
  const discount = await ManufacturerDiscount.findOne({ _id: id, warehouseId });
  if (!discount) {
    throw ApiError.notFound('Discount not found.', 'DISCOUNT_NOT_FOUND');
  }
  return discount;
}

// Percentage only - the manufacturer a discount applies to isn't editable
// (delete and re-create with a different one instead), matching the
// backend's own "no free text" rule at creation.
async function updateDiscount(id, warehouseId, changes) {
  const discount = await findOwnedDiscountOrThrow(id, warehouseId);
  validatePercentage(changes.discountPercentage);
  discount.discountPercentage = changes.discountPercentage;
  await discount.save();
  return discount;
}

async function deleteDiscount(id, warehouseId) {
  const discount = await findOwnedDiscountOrThrow(id, warehouseId);
  await discount.deleteOne();
}

// Section 15: Map<manufacturerId, discountPercentage> for this warehouse -
// fetched once and reused across every product in a catalog listing or
// order, rather than one query per product. Keyed on the central
// Manufacturer (M3); a discount row the migration could not match to one
// (manufacturerId null) applies to nothing, and is listed in its report.
//
// Also keyed by the normalized manufacturer name (`key:<normalized>`), for the
// one kind of product that has no Manufacturer to match on: a legacy product
// (no catalog link) whose free-text manufacturer matches no Manufacturer. It
// used to get its discount by an exact name match; it keeps getting it, now
// spelling-tolerant. Everything catalog-linked matches by id only.
async function getDiscountMapForWarehouse(warehouseId) {
  const discounts = await ManufacturerDiscount.find({ warehouseId })
    .select('manufacturerId manufacturerAr discountPercentage')
    .lean();
  const map = new Map();
  for (const discount of discounts) {
    if (discount.manufacturerId) map.set(String(discount.manufacturerId), discount.discountPercentage);
    const key = normalizeText(discount.manufacturerAr);
    if (key) map.set(`key:${key}`, discount.discountPercentage);
  }
  return map;
}

// The one way to read a product's manufacturer discount off that map - every
// catalog listing, the offers tab, reorder and order pricing go through it, so
// they cannot disagree about which products a discount reaches.
function discountPercentageFor(discountMap, product) {
  if (!discountMap || !product) return null;
  if (product.manufacturerId) {
    const id = product.manufacturerId._id ?? product.manufacturerId;
    return discountMap.get(String(id)) ?? null;
  }
  const key = product.manufacturerKey || normalizeText(product.manufacturerAr);
  return key ? discountMap.get(`key:${key}`) ?? null : null;
}

// Section 15: stacks with an active product-level Offer (project owner's
// decision) - the Offer's percentage is applied first, then the
// manufacturer's, both against the same base price. Multiplicative
// percentage discounts commute, so "which one first" doesn't change the
// result; this order just matches how the two are usually reasoned about
// (product-specific promotion, then a standing catalog-wide rule).
//
// Clamped at 0 (catalog overhaul Phase 7): a discount can never produce a
// negative price.
function computeDiscountedPriceUsd(priceUsd, offerDiscountPercentage, manufacturerDiscountPercentage) {
  let price = priceUsd;
  if (offerDiscountPercentage) {
    price *= 1 - offerDiscountPercentage / 100;
  }
  if (manufacturerDiscountPercentage) {
    price *= 1 - manufacturerDiscountPercentage / 100;
  }
  return Math.max(0, Math.round(price * 100) / 100);
}

// The same stacking in SYP, exactly as an order charges it: the offer, then
// the manufacturer discount, rounding to the nearest lira after each stage.
// Either percentage being falsy skips that stage. Clamped at 0.
function stackedDiscountSyp(baseSyp, offerPercentage, manufacturerDiscountPercentage) {
  let price = baseSyp;
  if (offerPercentage) {
    price = Math.round(price * (1 - offerPercentage / 100));
  }
  if (manufacturerDiscountPercentage) {
    price = Math.round(price * (1 - manufacturerDiscountPercentage / 100));
  }
  return Math.max(0, price);
}

// THE price of one unit of a product (catalog overhaul Phase 7): the final
// USD price, and - given the rate - the unit and final SYP prices with the
// exact rounding an order charges them at. The order computes its lines with
// this very function, and the catalog, reorder and offers responses expose its
// `finalSyp`, so the lira figure a pharmacist is shown is the one they are
// charged. `unitSyp` / `finalSyp` are null without a rate.
function computeFinalPrice({ priceUsd, offerDiscountPercentage = null, manufacturerDiscountPercentage = null, usdToSyp = null }) {
  const finalUsd = computeDiscountedPriceUsd(priceUsd, offerDiscountPercentage, manufacturerDiscountPercentage);
  if (!(usdToSyp > 0)) return { finalUsd, unitSyp: null, finalSyp: null };
  const unitSyp = Math.round(priceUsd * usdToSyp);
  return {
    finalUsd,
    unitSyp,
    finalSyp: stackedDiscountSyp(unitSyp, offerDiscountPercentage, manufacturerDiscountPercentage),
  };
}

module.exports = {
  listDiscountsForWarehouse,
  createDiscount,
  updateDiscount,
  deleteDiscount,
  getDiscountMapForWarehouse,
  discountPercentageFor,
  computeDiscountedPriceUsd,
  stackedDiscountSyp,
  computeFinalPrice,
};
