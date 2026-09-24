const { asyncHandler } = require('../utils/asyncHandler');
const discountService = require('../services/manufacturerDiscount.service');
const discountViewModel = require('../viewmodels/manufacturerDiscount.viewmodel');
const { loadWarehouseOrThrow } = require('../utils/loadWarehouse');

const list = asyncHandler(async (req, res) => {
  const warehouse = await loadWarehouseOrThrow(req.user._id);
  const discounts = await discountService.listDiscountsForWarehouse(warehouse._id);
  res.json({ success: true, ...discountViewModel.toDiscountListResponse(discounts) });
});

const create = asyncHandler(async (req, res) => {
  const warehouse = await loadWarehouseOrThrow(req.user._id);
  const discount = await discountService.createDiscount(warehouse._id, req.body);
  res.status(201).json({
    success: true,
    message: 'Discount created.',
    ...discountViewModel.toDiscountResponse(discount),
  });
});

const update = asyncHandler(async (req, res) => {
  const warehouse = await loadWarehouseOrThrow(req.user._id);
  const discount = await discountService.updateDiscount(req.params.id, warehouse._id, req.body);
  res.json({
    success: true,
    message: 'Discount updated.',
    ...discountViewModel.toDiscountResponse(discount),
  });
});

const remove = asyncHandler(async (req, res) => {
  const warehouse = await loadWarehouseOrThrow(req.user._id);
  await discountService.deleteDiscount(req.params.id, warehouse._id);
  res.json({ success: true, message: 'Discount removed.' });
});

module.exports = { list, create, update, remove };
