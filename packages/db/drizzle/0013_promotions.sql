CREATE TABLE `promotions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`name_ar` text NOT NULL,
	`percent_bp` integer NOT NULL,
	`start_business_date` text NOT NULL,
	`end_business_date` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` integer,
	`updated_by` integer,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `order_refunds` ADD `discount_halalas` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `promotion_id` integer REFERENCES promotions(id);--> statement-breakpoint
ALTER TABLE `orders` ADD `promotion_name` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `promotion_name_ar` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `promotion_percent_bp` integer;--> statement-breakpoint
CREATE INDEX `idx_orders_promotion` ON `orders` (`promotion_id`);
