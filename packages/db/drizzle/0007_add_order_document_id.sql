-- Add document_id columns to orders and order_refunds.
-- Columns are nullable at the SQL level for ALTER TABLE compatibility;
-- the Drizzle schema enforces .notNull() at the application level.
-- No backfill needed — fresh DBs have empty tables.

ALTER TABLE `orders` ADD `document_id` text;--> statement-breakpoint
ALTER TABLE `order_refunds` ADD `document_id` text;--> statement-breakpoint

CREATE UNIQUE INDEX `orders_document_id_unique` ON `orders` (`document_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `order_refunds_document_id_unique` ON `order_refunds` (`document_id`);
