CREATE TABLE `delivery_partners` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` integer,
	`updated_by` integer,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `orders` ADD `delivery_partner_id` text REFERENCES delivery_partners(id);--> statement-breakpoint
ALTER TABLE `orders` ADD `delivery_external_ref` text;--> statement-breakpoint
CREATE INDEX `idx_orders_delivery_partner` ON `orders` (`delivery_partner_id`);