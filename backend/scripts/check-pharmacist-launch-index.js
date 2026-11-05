// Deployment preflight: preserve legacy phone identities and add the new reservation index.
const mongoose = require('mongoose');

async function inspectRegistrationIndex(collection) {
  let indexes;
  try { indexes = await collection.indexes(); }
  catch (error) {
    if (error.code === 26) return { ready: false, code: 'REGISTRATION_INDEX_MISSING' };
    throw error;
  }
  const candidates = indexes.filter(index => Object.keys(index.key || {}).length === 1 && index.key.registrationPhoneKey === 1);
  const safe = index => index.unique === true && index.sparse === true && !index.partialFilterExpression &&
    (!index.collation || index.collation.locale === 'simple');
  return { ready: candidates.some(safe), code: candidates.some(safe) ? 'REGISTRATION_INDEX_READY'
    : candidates.length ? 'REGISTRATION_INDEX_INCOMPATIBLE' : 'REGISTRATION_INDEX_MISSING' };
}

async function main({ checkOnly = false } = {}) {
  let mongodbUri;
  if (checkOnly) {
    // Reading index metadata needs only database access, never the app JWT key.
    require('dotenv').config({ quiet: true });
    mongodbUri = process.env.MONGODB_URI;
    if (!mongodbUri) throw new Error('Database access is not configured.');
  } else mongodbUri = require('../src/config/env').mongodbUri;
  await mongoose.connect(mongodbUri, checkOnly ? { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 10000 } : {});
  try {
    if (checkOnly) {
      const result = await inspectRegistrationIndex(mongoose.connection.collection('users'));
      console.log(JSON.stringify({ ...result, readOnly: true }));
      return result;
    }
    await mongoose.connection.collection('users').createIndex({ registrationPhoneKey: 1 },
      { unique: true, sparse: true, name: 'registrationPhoneKey_1' });
    console.log('Pharmacist registration uniqueness index is ready.');
  } finally { await mongoose.disconnect(); }
}
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    console.log('Usage: node backend/scripts/check-pharmacist-launch-index.js [--check-only]\n--check-only reads index metadata without creating or changing indexes. No flag retains the existing explicit index-creation behavior.');
  } else if (args.some(arg => arg !== '--check-only')) {
    console.error('Unknown index preflight argument.'); process.exitCode = 1;
  } else main({ checkOnly: args.includes('--check-only') }).then(result => {
    if (result && !result.ready) process.exitCode = 1;
  }).catch(() => {
    console.error('Registration index preflight failed; resolve before releasing registration.');
    process.exitCode = 1;
  });
}
module.exports = { main, inspectRegistrationIndex };
