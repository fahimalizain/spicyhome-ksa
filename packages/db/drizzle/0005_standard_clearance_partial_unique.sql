-- Partial unique indexes: at most one cleared invoice per order, and at
-- most one cleared credit note per refund.
-- (SQLite partial unique indexes are not expressible in Drizzle schema.ts;
--  see comments on zatcaInvoices / zatcaCreditNotes.)
CREATE UNIQUE INDEX IF NOT EXISTS `zatca_invoices_one_cleared_per_order`
  ON `zatca_invoices` (`order_id`) WHERE `status` = 'cleared';
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `zatca_credit_notes_one_cleared_per_refund`
  ON `zatca_credit_notes` (`refund_id`) WHERE `status` = 'cleared';
