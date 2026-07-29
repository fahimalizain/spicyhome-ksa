ALTER TABLE `printers` ADD `connection_type` text DEFAULT 'tcp' NOT NULL;--> statement-breakpoint
ALTER TABLE `printers` ADD `windows_printer_name` text;--> statement-breakpoint
ALTER TABLE `printers` ADD `config` text DEFAULT '{}' NOT NULL;