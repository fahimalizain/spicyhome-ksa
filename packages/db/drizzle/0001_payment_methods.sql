CREATE TABLE `payment_methods` (
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
CREATE TABLE `order_payments` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `order_id` integer NOT NULL,
  `method_id` text NOT NULL,
  `method_title` text NOT NULL,
  `amount_halalas` integer NOT NULL,
  `tendered_halalas` integer,
  `change_halalas` integer,
  `created_at` integer NOT NULL,
  `created_by` integer,
  FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`method_id`) REFERENCES `payment_methods`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `order_payments_order_id_method_id_unique` ON `order_payments` (`order_id`, `method_id`);
--> statement-breakpoint
-- Seed default payment methods
INSERT INTO `payment_methods` (`id`, `title`, `enabled`, `sort_order`, `created_at`, `updated_at`) VALUES ('cash', 'Cash', 1, 0, 1711584000, 1711584000);
--> statement-breakpoint
INSERT INTO `payment_methods` (`id`, `title`, `enabled`, `sort_order`, `created_at`, `updated_at`) VALUES ('card', 'Card', 1, 1, 1711584000, 1711584000);
--> statement-breakpoint
INSERT INTO `payment_methods` (`id`, `title`, `enabled`, `sort_order`, `created_at`, `updated_at`) VALUES ('mada', 'mada', 1, 2, 1711584000, 1711584000);
