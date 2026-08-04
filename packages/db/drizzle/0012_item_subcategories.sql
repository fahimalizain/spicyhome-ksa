CREATE TABLE `item_subcategories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`category_id` integer NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` integer,
	`updated_by` integer,
	FOREIGN KEY (`category_id`) REFERENCES `item_categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
-- Hand-fixed: drizzle-kit emits `ADD subcategory_id integer NOT NULL REFERENCES
-- item_subcategories(id)`, which SQLite rejects — NOT NULL requires a non-NULL
-- default, while a REFERENCES clause requires a NULL default (and non-empty
-- tables can never take NOT NULL without a default). The column is therefore
-- added NULLABLE; the schema keeps NOT NULL because seed() and the menu API
-- always write a value on fresh installs / new rows.
ALTER TABLE `items` ADD `subcategory_id` integer REFERENCES `item_subcategories`(`id`);--> statement-breakpoint
CREATE INDEX `idx_item_subcategories_category_id` ON `item_subcategories` (`category_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `item_subcategories_category_id_name_unique` ON `item_subcategories` (`category_id`,`name`);
