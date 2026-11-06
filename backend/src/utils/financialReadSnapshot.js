const mongoose = require('mongoose');

// Reports must not mix an opening/cache read with movements committed later.
// Keep the session local to this read; no posting or balance rebuild occurs.
async function financialReadSnapshot(work) {
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(() => work(session), {
      readConcern: { level: 'snapshot' }, readPreference: 'primary',
    });
  } finally {
    await session.endSession();
  }
}
module.exports = { financialReadSnapshot };
