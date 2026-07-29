ALTER TABLE `orders` ADD `is_standard_invoice` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `zatca_buyer_details` text;