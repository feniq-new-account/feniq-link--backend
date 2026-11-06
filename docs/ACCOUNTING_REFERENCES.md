# Accounting movement references

The accountant dashboard and pharmacy statement use one reference component.
Every movement exposes its own ledger entry number; corrections expose the ID
of the entry they reverse. Invoice/order and return IDs navigate to the existing
warehouse-scoped detail APIs/screens. Missing legacy references remain readable;
no payment-detail route, invoice paid status or payment allocation is invented.
Reference labels and IDs are React-escaped, navigation IDs URL-encoded.

Existing summary counts are now labelled net invoice/payment postings. They
subtract reversal postings in the selected period and can be negative when an
older event is reversed now; they are not counts of open/paid invoices. Neither
amounts nor posting rules change. No backend or permission changes are needed.

Read validation also rejects an explicitly invalid custom report end date; the
existing omitted-end default is unchanged. Invalid input cannot silently yield
a report through the current date.

Activity filters additionally support pharmacy name/phone and current account
balance type (debt/credit/zero), intersecting any exact pharmacy filter inside
the same snapshot. Only activity rows are filtered; the KPI labels explicitly
retain whole-warehouse scope. No invoice settlement status is inferred.
Account-list/summary/statement and settlement routes set no-store to avoid
reusing financial data from browser/proxy caches.
