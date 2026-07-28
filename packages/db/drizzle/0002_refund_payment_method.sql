ALTER TABLE `order_refunds` ADD `method_id` text NOT NULL DEFAULT 'cash' REFERENCES `payment_methods`(`id`);--> statement-breakpoint
ALTER TABLE `order_refunds` ADD `method_title` text NOT NULL DEFAULT 'Cash';
