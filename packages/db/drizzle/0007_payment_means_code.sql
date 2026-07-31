-- ZATCA Payment Means type codes (BT-81, UNTDID 4461 subset 10|30|42|48|1 —
-- see docs/zatca/ overview + BR-KSA-16) — snapshot columns.
--
-- payment_methods.zatca_payment_means_code is the catalog value; order_payments
-- and order_refunds snapshot it at pay/refund time so invoices/credit notes
-- stay stable even if the catalog method is later re-mapped.
--
-- SQLite cannot ADD a NOT NULL column without a DEFAULT to a table with
-- existing rows, so each column is added with DEFAULT '10' (the ZATCA
-- fallback code, also the cash code) and then backfilled from the payment
-- method catalog. The application always writes explicit values; the column
-- default only covers legacy rows inserted outside the app.
ALTER TABLE `payment_methods` ADD `zatca_payment_means_code` text NOT NULL DEFAULT '10';
--> statement-breakpoint
UPDATE `payment_methods` SET `zatca_payment_means_code` = '48' WHERE `id` IN ('card', 'mada');
--> statement-breakpoint
ALTER TABLE `order_payments` ADD `zatca_payment_means_code` text NOT NULL DEFAULT '10';
--> statement-breakpoint
UPDATE `order_payments`
SET `zatca_payment_means_code` = COALESCE(
  (SELECT `pm`.`zatca_payment_means_code`
   FROM `payment_methods` AS `pm`
   WHERE `pm`.`id` = `order_payments`.`method_id`),
  '10'
);
--> statement-breakpoint
ALTER TABLE `order_refunds` ADD `zatca_payment_means_code` text NOT NULL DEFAULT '10';
--> statement-breakpoint
UPDATE `order_refunds`
SET `zatca_payment_means_code` = COALESCE(
  (SELECT `pm`.`zatca_payment_means_code`
   FROM `payment_methods` AS `pm`
   WHERE `pm`.`id` = `order_refunds`.`method_id`),
  '10'
);
