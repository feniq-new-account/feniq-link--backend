// Designed branding for the demo deployment: a logo per demo warehouse
// (data/demo-logos/<phone>.png), a designed banner per warehouse
// (data/demo-banners/<phone>.jpg) in place of the plain product photo, and two
// Feniq banners from the admin. Applied once per BRANDING_VERSION, so a
// deployment seeded with the old placeholder logos gets the new ones on its
// next boot, and a later version bump replaces them again.
const fs = require('node:fs/promises');
const path = require('node:path');
const PlatformSetting = require('../models/platformSetting.model');
const User = require('../models/user.model');
const Warehouse = require('../models/warehouse.model');
const Banner = require('../models/banner.model');
const { uploadImage } = require('./upload.service');
const { WAREHOUSES, DEMO_ADMIN } = require('./demoSeed.service');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SETTING_KEY = 'demoBrandingVersion';
const BRANDING_VERSION = 1;
const DAY_MS = 24 * 60 * 60 * 1000;

const WAREHOUSE_BANNER_TITLES = {
  '0930000101': 'خصم 15% على الباراسيتامول',
  '0930000102': 'عرض المضادات الحيوية',
  '0930000103': 'وصل حديثاً من معامل سوريا',
};

const FENIQ_BANNERS = [
  { file: 'feniq-all-warehouses.jpg', title: 'كل مستودعات اللاذقية بتطبيق واحد' },
  { file: 'feniq-cash-on-delivery.jpg', title: 'اطلب بكبسة، وادفع عند الاستلام' },
];

function readAsset(dir, name) {
  return fs.readFile(path.join(DATA_DIR, dir, name));
}

async function applyDemoBranding() {
  const setting = await PlatformSetting.findOne({ key: SETTING_KEY }).lean();
  if (setting && Number(setting.value) >= BRANDING_VERSION) return null;

  const users = await User.find({ phone: { $in: WAREHOUSES.map((w) => w.phone) }, role: 'warehouse' })
    .select('_id phone')
    .lean();
  if (!users.length) return null; // not a demo deployment

  const now = Date.now();
  const endDate = new Date(now + 60 * DAY_MS);
  const result = { logos: 0, banners: 0, feniqBanners: 0 };

  for (const user of users) {
    const warehouse = await Warehouse.findOne({ userId: user._id });
    if (!warehouse) continue;
    warehouse.logo = await uploadImage(await readAsset('demo-logos', `${user.phone}.png`), 'warehouses');
    await warehouse.save();
    result.logos += 1;

    const imageUrl = await uploadImage(await readAsset('demo-banners', `${user.phone}.jpg`), 'banners');
    const { modifiedCount } = await Banner.updateMany(
      { warehouseId: warehouse._id },
      { $set: { imageUrl, mediaType: 'image', title: WAREHOUSE_BANNER_TITLES[user.phone], endDate } }
    );
    result.banners += modifiedCount;
  }

  const admin = await User.findOne({ phone: DEMO_ADMIN.phone }).select('_id').lean();
  if (admin) {
    const adminBannerService = require('./adminBanner.service');
    for (const banner of FENIQ_BANNERS) {
      if (await Banner.exists({ warehouseId: null, title: banner.title })) continue;
      const imageUrl = await uploadImage(await readAsset('demo-banners', banner.file), 'banners');
      await adminBannerService.createAdminBanner(admin._id, {
        startDate: new Date(now - DAY_MS).toISOString(),
        endDate: endDate.toISOString(),
        title: banner.title,
        imageUrl,
      });
      result.feniqBanners += 1;
    }
  }

  await PlatformSetting.updateOne({ key: SETTING_KEY }, { $set: { value: BRANDING_VERSION } }, { upsert: true });
  return result;
}

module.exports = { applyDemoBranding, BRANDING_VERSION, FENIQ_BANNERS, WAREHOUSE_BANNER_TITLES };
