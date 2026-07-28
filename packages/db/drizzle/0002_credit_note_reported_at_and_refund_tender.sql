ALTER TABLE `order_refunds` ADD `method_id` text NOT NULL REFERENCES payment_methods(id);--> statement-breakpoint
ALTER TABLE `order_refunds` ADD `method_title` text NOT NULL;--> statement-breakpoint
ALTER TABLE `zatca_credit_notes` ADD `reported_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_order_payments_order_method` ON `order_payments` (`order_id`,`method_id`);