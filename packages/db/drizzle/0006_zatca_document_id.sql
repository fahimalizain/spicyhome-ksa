-- document_id columns are nullable at the SQL level because SQLite cannot
-- ALTER TABLE ADD a NOT NULL column without a default on non-empty tables;
-- the Drizzle schema (.notNull().unique()) enforces it at the application level
-- and every zatca_invoices / zatca_credit_notes insert sets it.
ALTER TABLE `zatca_credit_notes` ADD `document_id` text;--> statement-breakpoint
ALTER TABLE `zatca_invoices` ADD `document_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `zatca_credit_notes_document_id_unique` ON `zatca_credit_notes` (`document_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `zatca_invoices_document_id_unique` ON `zatca_invoices` (`document_id`);
