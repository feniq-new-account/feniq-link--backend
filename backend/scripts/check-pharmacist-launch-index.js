// Deployment preflight: preserve legacy phone identities and add the new reservation index.
const mongoose = require('mongoose');
const env = require('../src/config/env');
async function main() {
  await mongoose.connect(env.mongodbUri);
  try {
    await mongoose.connection.collection('users').createIndex({ registrationPhoneKey: 1 },
      { unique: true, sparse: true, name: 'registrationPhoneKey_1' });
    console.log('Pharmacist registration uniqueness index is ready.');
  } finally { await mongoose.disconnect(); }
}
if (require.main === module) main().catch(() => {
  console.error('Registration index preflight failed; resolve before releasing registration.');
  process.exitCode = 1;
});
module.exports = { main };
