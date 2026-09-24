// The image every response shows for a warehouse product (catalog overhaul
// Phase 9): the warehouse's own override (`product.image`) when it set one,
// otherwise the catalog item's central image. Read from the populated
// `masterProductId` (every identity populate selects `imageUrl`), so the
// stored override is never rewritten - an old app reading `image` simply gets
// the central picture for free.
function effectiveImage(product) {
  if (!product) return null;
  if (product.image) return product.image;
  const catalogItem = product.masterProductId;
  if (catalogItem && typeof catalogItem === 'object' && catalogItem.imageUrl) return catalogItem.imageUrl;
  return null;
}

// The catalog item's central image alone (null when unpopulated or unset) -
// the warehouse's edit form shows it under a cleared override.
function catalogImage(product) {
  const catalogItem = product?.masterProductId;
  return (catalogItem && typeof catalogItem === 'object' && catalogItem.imageUrl) || null;
}

module.exports = { effectiveImage, catalogImage };
