DROP INDEX IF EXISTS `zatca_credit_notes_refund_id_unique`;--> statement-breakpoint
DROP INDEX IF EXISTS `zatca_invoices_order_id_unique`;--> statement-breakpoint
-- document_id columns are nullable at the SQL level because SQLite cannot
-- ALTER TABLE ADD a NOT NULL column without a default on non-empty tables;
-- the Drizzle schema (.notNull().unique()) enforces it at the application level.
ALTER TABLE `order_refunds` ADD `document_id` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `is_standard_invoice` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `zatca_buyer_details` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `document_id` text;--> statement-breakpoint
ALTER TABLE `zatca_credit_notes` ADD `document_id` text;--> statement-breakpoint
ALTER TABLE `zatca_credit_notes` ADD `attempt_no` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `zatca_credit_notes` ADD `clearance_errors` text;--> statement-breakpoint
ALTER TABLE `zatca_credit_notes` ADD `clearance_warnings` text;--> statement-breakpoint
ALTER TABLE `zatca_credit_notes` ADD `http_status` integer;--> statement-breakpoint
ALTER TABLE `zatca_invoices` ADD `document_id` text;--> statement-breakpoint
ALTER TABLE `zatca_invoices` ADD `attempt_no` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `zatca_invoices` ADD `clearance_errors` text;--> statement-breakpoint
ALTER TABLE `zatca_invoices` ADD `clearance_warnings` text;--> statement-breakpoint
ALTER TABLE `zatca_invoices` ADD `http_status` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `order_refunds_document_id_unique` ON `order_refunds` (`document_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_document_id_unique` ON `orders` (`document_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `zatca_credit_notes_document_id_unique` ON `zatca_credit_notes` (`document_id`);--> statement-breakpoint
CREATE INDEX `idx_zatca_credit_notes_refund_id` ON `zatca_credit_notes` (`refund_id`);--> statement-breakpoint
CREATE INDEX `idx_zatca_credit_notes_order_id` ON `zatca_credit_notes` (`order_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `zatca_invoices_document_id_unique` ON `zatca_invoices` (`document_id`);--> statement-breakpoint
CREATE INDEX `idx_zatca_invoices_order_id` ON `zatca_invoices` (`order_id`);
