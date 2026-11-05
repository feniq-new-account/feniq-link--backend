const { Schema, model } = require('mongoose');

const deviceTokenSchema = new Schema(
  {
    fcmToken: { type: String, required: true },
    deviceType: { type: String, enum: ['android', 'ios'], required: true },
    lastUsedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, unique: true, trim: true },
    // New registrations reserve both Syrian phone spellings without rewriting legacy identities.
    registrationPhoneKey: { type: String, unique: true, sparse: true, select: false },
    password: { type: String, select: false },
    // 'rep' is a warehouse's field sales rep (rep.model.js): created by that
    // warehouse from its panel, signs in to the same mobile app, and sees only
    // the pharmacies the warehouse assigned to them.
    role: {
      type: String,
      enum: ['admin', 'warehouse', 'pharmacy', 'rep'],
      required: true,
    },
    // Null is the pre-existing combined warehouse login. New memberships
    // distinguish the mobile owner from the accounting operator explicitly.
    warehouseRole: { type: String, enum: ['owner', 'accountant'], default: null },
    // 'deleted' is a self-service deletion (auth.service.js deleteAccount) and
    // is terminal: it is refused at authenticate, so it must never be treated
    // as merely "not active". Distinct from 'blocked', which an admin applies
    // and can lift - nobody can un-delete an account from the panel.
    status: {
      type: String,
      enum: ['pending', 'active', 'blocked', 'deleted'],
      default: 'pending',
    },
    // First transition into active status for a pharmacy. Used to anchor the
    // licence-review grace period; never reset on blocking/re-approval.
    // Legacy accounts keep null until an explicit administrative migration.
    pharmacyApprovedAt: { type: Date, default: null, select: false },
    lang: { type: String, enum: ['ar', 'en'], default: 'ar' },
    deviceTokens: { type: [deviceTokenSchema], default: [] },

    // Bumped to invalidate every access token already issued for this user
    // (audit F-03). authenticate compares it against the claim in the token,
    // reading it from the findById it already performs - so revocation costs
    // no extra query. Defaults to 0, and a token minted before this field
    // existed carries no claim and is read as 0, so deploying it logs nobody
    // out.
    tokenVersion: { type: Number, default: 0 },
    accessRevision: { type: Number, default: 0 },

    // Login throttling (Audit H-2). Counts CONSECUTIVE failures: reset to 0 by
    // any successful password check, so a user who mistypes twice and then
    // gets in carries nothing forward. auth.service.js owns the escalation.
    failedLoginAttempts: { type: Number, default: 0 },
    // While set and in the future, password login is refused even when the
    // password is correct.
    lockedUntil: { type: Date, default: null },

    // Set when an admin resets the password (the admin chose a temporary one
    // and read it out to the user); cleared by any password the user sets
    // themselves (change-password, or the OTP reset). The pharmacy app reads it
    // from the auth response and shows nothing but the change-password screen
    // until it is cleared. Accounts that predate the field have no value and
    // read as false, so deploying it forces nobody.
    mustChangePassword: { type: Boolean, default: false },

    // Set by deleteAccount alongside status: 'deleted'. Kept separate from
    // `updatedAt` so a later retention/purge job can find accounts by when the
    // user actually asked to leave.
    deletedAt: { type: Date, default: null },

    // Admins only: the Telegram chat that receives new-registration alerts and
    // whose approve/reject buttons act as this admin (services/telegram.service.js).
    // Set by opening the one-time link from the admin panel - the link token is
    // stored hashed and expires, so a forwarded link is useless after a while.
    telegramChatId: { type: Number, default: null },
    telegramLinkTokenHash: { type: String, default: null, select: false },
    telegramLinkExpiresAt: { type: Date, default: null, select: false },
  },
  { timestamps: true }
);

// Level 2 (see docs/PERFORMANCE_OPTIMIZATION.md). warehouse.listAvailableWarehouses
// (`find({ role:'warehouse', status:'active' })`, on the browsing path) plus the
// admin pending-account list/count and the broadcast recipient scan all filtered
// role + status with no supporting index - a full users scan each time.
userSchema.index({ role: 1, status: 1 });

module.exports = model('User', userSchema);
