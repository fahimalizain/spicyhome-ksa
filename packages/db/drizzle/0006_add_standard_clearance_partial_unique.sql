-- Backfill existing rows: attempt_no = 1 for any rows that already exist.
-- This is a no-op when applying to a fresh DB, but ensures consistency for
-- existing databases with pre-clearance-multi-attempt rows.
UPDATE `zatca_invoices` SET `attempt_no` = 1 WHERE `attempt_no` IS NULL;--> statement-breakpoint
UPDATE `zatca_credit_notes` SET `attempt_no` = 1 WHERE `attempt_no` IS NULL;--> statement-breakpoint

-- Conservative backfill: existing standard rows with status 'failed' should
-- be 'rejected' (they went through clearance and were not cleared).
-- Simplified 'failed' rows stay 'failed' (reporting retry).
-- We identify standard rows by presence of the standard invoice type in the
-- XML (subtype 0100000).  Any row whose xml contains 0100000 is a standard
-- document that went through clearance and should be 'rejected' not 'failed'.
UPDATE `zatca_invoices` SET `status` = 'rejected'
  WHERE `status` = 'failed' AND `xml` LIKE '%0100000%';--> statement-breakpoint
UPDATE `zatca_credit_notes` SET `status` = 'rejected'
  WHERE `status` = 'failed' AND `xml` LIKE '%0100000%';--> statement-breakpoint

-- Partial unique indexes: at most one cleared invoice per order, and at
-- most one cleared credit note per refund.
CREATE UNIQUE INDEX IF NOT EXISTS `zatca_invoices_one_cleared_per_order`
  ON `zatca_invoices` (`order_id`) WHERE `status` = 'cleared';--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS `zatca_credit_notes_one_cleared_per_refund`
  ON `zatca_credit_notes` (`refund_id`) WHERE `status` = 'cleared';
