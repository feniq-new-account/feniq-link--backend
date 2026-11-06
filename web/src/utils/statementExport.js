// Only the loaded server statement is exported. No balance or FX calculation
// happens in the browser. reportCsv handles quoting and spreadsheet formulas.
export function statementCsvRows(statement, t, warehouse = null) {
  return [
    [t('statement.title'), warehouse?.nameEn || warehouse?.nameAr || ''],
    [t('accounting.pharmacy'), statement.pharmacy?.nameEn || statement.pharmacy?.nameAr || '', statement.pharmacy?.phone || ''],
    [t('accounting.updatedAt'), statement.asOf || '', 'Asia/Damascus'],
    [t('statement.from'), statement.period.from, t('statement.to'), statement.period.to],
    [t('statement.opening'), statement.opening.syp, 'SYP'],
    [t('statement.netMovement'), statement.reconciliation?.netMovementSyp ?? '', 'SYP'],
    [t('statement.closing'), statement.closing.syp, 'SYP'],
    [t('statement.reconciliationDifference'), statement.reconciliation?.differenceSyp ?? '', 'SYP'],
    [t('accounting.reference'), t('accounting.date'), t('statement.postedAt'), t('accounting.type'),
      t('statement.invoiceReference'), t('statement.paymentReference'), t('statement.returnReference'),
      t('accounting.debit'), t('accounting.credit'), t('statement.balance'), t('statement.reason'), t('statement.reversalOf')],
    ...statement.rows.map((row) => [
      `LE-${row.entryNumber}`, row.effectiveAt, row.postedAt || '', row.kind,
      row.reference?.invoiceNumber ?? '', row.reference?.paymentNumber ?? '', row.reference?.returnId ?? '',
      row.debitSyp, row.creditSyp, row.balanceSyp, row.reason || '', row.reversalOf || '',
    ]),
  ];
}
