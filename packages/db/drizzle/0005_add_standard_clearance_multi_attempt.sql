DROP INDEX IF EXISTS `zatca_credit_notes_refund_id_unique`;--> statement-breakpoint
DROP INDEX IF EXISTS `zatca_invoices_order_id_unique`;--> statement-breakpoint
ALTER TABLE `zatca_credit_notes` ADD `attempt_no` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `zatca_credit_notes` ADD `clearance_errors` text;--> statement-breakpoint
ALTER TABLE `zatca_credit_notes` ADD `clearance_warnings` text;--> statement-breakpoint
ALTER TABLE `zatca_credit_notes` ADD `http_status` integer;--> statement-breakpoint
ALTER TABLE `zatca_invoices` ADD `attempt_no` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `zatca_invoices` ADD `clearance_errors` text;--> statement-breakpoint
ALTER TABLE `zatca_invoices` ADD `clearance_warnings` text;--> statement-breakpoint
ALTER TABLE `zatca_invoices` ADD `http_status` integer;--> statement-breakpoint
CREATE INDEX `idx_zatca_credit_notes_refund_id` ON `zatca_credit_notes` (`refund_id`);--> statement-breakpoint
CREATE INDEX `idx_zatca_credit_notes_order_id` ON `zatca_credit_notes` (`order_id`);--> statement-breakpoint
CREATE INDEX `idx_zatca_invoices_order_id` ON `zatca_invoices` (`order_id`);