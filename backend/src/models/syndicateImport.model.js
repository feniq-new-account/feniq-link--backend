const { Schema, model } = require('mongoose');

// One upload of the syndicate list. Append-only: the newest row describes the
// list currently in use, the older ones are the history the admin page shows.
const syndicateImportSchema = new Schema(
  {
    fileName: { type: String, default: '' },
    rowCount: { type: Number, required: true },
    skippedRows: { type: Number, default: 0 },
    autoApproved: { type: Number, default: 0 },
    importedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

module.exports = model('SyndicateImport', syndicateImportSchema);
