# SpicyHome POS — Database Plan

SQLite via Drizzle ORM (`better-sqlite3`). All names English, snake_case.

## Conventions

- **Money**: integer **halalas** (SAR × 100). Never floats. Critical for ZATCA.
- **IDs**: integer autoincrement primary keys.
- **Timestamps**: integer unix epoch (`created_at`, `updated_at`).
- **Audit fields**: every table (except `order_audit_log` and `settings`) has
  `created_by` / `updated_by` (int FK → users, null for seed rows), populated
  automatically by a NestJS interceptor from the authenticated user.
- **Booleans**: integer 0/1.
- **Enums**: text columns with a checked set of values.
- **Snapshots**: order lines copy item name/price/VAT at order time so later
  menu edits never corrupt historical orders.
- **VAT**: prices are VAT-**inclusive** (KSA restaurant norm); VAT rate stored
  per item in basis points to support zero-rated/exempt items.

## users

| col                     | type                         | notes                        |
| ----------------------- | ---------------------------- | ---------------------------- |
| id                      | int PK                       |                              |
| username                | text unique not null         |                              |
| pin_hash                | text not null                | bcrypt hash of 4–6 digit PIN |
| name                    | text not null                | display name                 |
| role_id                 | int FK → user_roles not null |                              |
| is_active               | int bool not null, default 1 |                              |
| created_at / updated_at | int not null                 |                              |
| created_by / updated_by | int FK → users, null         |                              |

## user_roles

Boolean permission columns; checked by a NestJS guard per endpoint.

| col                     | type                 | notes                                                     |
| ----------------------- | -------------------- | --------------------------------------------------------- |
| id                      | int PK               |                                                           |
| name                    | text unique not null | e.g. `admin`, `staff`                                     |
| create_order            | int bool             |                                                           |
| update_order            | int bool             | add/remove items on an open order                         |
| delete_order_item       | int bool             | separate from update_order — removing lines is restricted |
| void_order              | int bool             |                                                           |
| refund_order            | int bool             |                                                           |
| manage_menu             | int bool             | items & categories CRUD                                   |
| manage_tables           | int bool             |                                                           |
| manage_printers         | int bool             |                                                           |
| manage_users            | int bool             | users & roles CRUD                                        |
| manage_settings         | int bool             | incl. ZATCA onboarding                                    |
| created_at / updated_at | int not null         |                                                           |
| created_by / updated_by | int FK → users, null |                                                           |

Seed roles: `admin` (all 1), `staff` (create_order, update_order = 1, rest 0).

## tables

| col                     | type                         | notes           |
| ----------------------- | ---------------------------- | --------------- |
| id                      | int PK                       |                 |
| name                    | text unique not null         | e.g. "T1", "T4" |
| sort_order              | int not null, default 0      |                 |
| is_active               | int bool not null, default 1 |                 |
| created_at / updated_at | int not null                 |                 |
| created_by / updated_by | int FK → users, null         |                 |

## printers

| col                     | type                         | notes                     |
| ----------------------- | ---------------------------- | ------------------------- |
| id                      | int PK                       |                           |
| name                    | text unique not null         | e.g. "Kitchen", "Counter" |
| ip                      | text not null                |                           |
| port                    | int not null, default 9100   |                           |
| role                    | text not null                | `receipt` \| `kitchen`    |
| is_active               | int bool not null, default 1 |                           |
| created_at / updated_at | int not null                 |                           |
| created_by / updated_by | int FK → users, null         |                           |

## item_categories

| col                     | type                         | notes                                        |
| ----------------------- | ---------------------------- | -------------------------------------------- |
| id                      | int PK                       |                                              |
| name                    | text not null                |                                              |
| sort_order              | int not null, default 0      |                                              |
| printer_id              | int FK → printers, null      | kitchen routing: category's items print here |
| is_active               | int bool not null, default 1 |                                              |
| created_at / updated_at | int not null                 |                                              |
| created_by / updated_by | int FK → users, null         |                                              |

## items

| col                     | type                              | notes                                                                  |
| ----------------------- | --------------------------------- | ---------------------------------------------------------------------- |
| id                      | int PK                            |                                                                        |
| category_id             | int FK → item_categories not null |                                                                        |
| name                    | text not null                     | English name                                                           |
| name_ar                 | text null                         | Arabic name — printed on ZATCA receipts (receipts must include Arabic) |
| price_halalas           | int not null                      | VAT-inclusive selling price                                            |
| vat_rate_bp             | int not null, default 1500        | basis points (1500 = 15%)                                              |
| sort_order              | int not null, default 0           |                                                                        |
| is_active               | int bool not null, default 1      |                                                                        |
| created_at / updated_at | int not null                      |                                                                        |
| created_by / updated_by | int FK → users, null              |                                                                        |

## orders

| col                     | type                           | notes                                                |
| ----------------------- | ------------------------------ | ---------------------------------------------------- |
| id                      | int PK                         |                                                      |
| order_no                | int not null                   | human-friendly daily sequence (resets each day)      |
| uuid                    | text unique not null           |                                                      |
| type                    | text not null                  | `dine_in` \| `takeaway`                              |
| table_id                | int FK → tables, null          | required for dine_in, null for takeaway              |
| day_opening_id          | int FK → day_openings not null | business day the order belongs to                    |
| status                  | text not null                  | `open` \| `sent` \| `paid` \| `voided` \| `refunded` |
| subtotal_halalas        | int not null, default 0        | excl. VAT                                            |
| vat_halalas             | int not null, default 0        |                                                      |
| total_halalas           | int not null, default 0        | incl. VAT                                            |
| discount_halalas        | int not null, default 0        |                                                      |
| created_at / updated_at | int not null                   |                                                      |
| created_by / updated_by | int FK → users, null           |                                                      |

Unique index on (`created_at` day, `order_no`) — enforced via a daily
sequence counter in `settings`.

## order_items

| col                     | type                     | notes                                           |
| ----------------------- | ------------------------ | ----------------------------------------------- |
| id                      | int PK                   |                                                 |
| order_id                | int FK → orders not null | cascade delete only while order is `open`       |
| item_id                 | int FK → items, null     | kept for reporting; survives item edits/deletes |
| item_name               | text not null            | snapshot                                        |
| unit_price_halalas      | int not null             | snapshot                                        |
| vat_rate_bp             | int not null             | snapshot                                        |
| qty                     | int not null             |                                                 |
| total_halalas           | int not null             | qty × unit_price, incl. VAT                     |
| notes                   | text null                | e.g. "no onion"                                 |
| created_at / updated_at | int not null             |                                                 |
| created_by / updated_by | int FK → users, null     |                                                 |

## order_audit_log — immutable, append-only

Never updated or deleted. Application enforces this (no UPDATE/DELETE code
paths); a SQLite trigger additionally blocks mutations.

| col        | type                     | notes                                                                                               |
| ---------- | ------------------------ | --------------------------------------------------------------------------------------------------- |
| id         | int PK                   |                                                                                                     |
| order_id   | int FK → orders not null |                                                                                                     |
| user_id    | int FK → users not null  | who did it                                                                                          |
| action     | text not null            | `created`, `item_added`, `item_removed`, `sent_to_kitchen`, `paid`, `printed`, `voided`, `refunded` |
| payload    | text not null            | JSON detail/diff of the action                                                                      |
| prev_hash  | text not null            | hash of previous row for this order (empty string for first row)                                    |
| hash       | text not null            | sha256(order_id, user_id, action, payload, prev_hash, created_at)                                   |
| created_at | int not null             |                                                                                                     |

## invoices (ZATCA Phase 2)

| col                     | type                            | notes                                                       |
| ----------------------- | ------------------------------- | ----------------------------------------------------------- |
| id                      | int PK                          |                                                             |
| order_id                | int FK → orders unique not null | one invoice per order                                       |
| icv                     | int unique not null             | Invoice Counter Value — strictly incrementing, never reused |
| uuid                    | text unique not null            |                                                             |
| invoice_hash            | text not null                   | base64 sha256 of the canonical XML                          |
| prev_invoice_hash       | text not null                   | PIH — chains to previous invoice (ZATCA requirement)        |
| xml                     | text not null                   | signed UBL 2.1 invoice XML                                  |
| qr_tlv                  | text not null                   | TLV QR payload printed on receipt                           |
| status                  | text not null                   | `signed` \| `reported` \| `failed`                          |
| reported_at             | int null                        |                                                             |
| created_at / updated_at | int not null                    |                                                             |
| created_by / updated_by | int FK → users, null            |                                                             |

## day_openings

One row per business day. Orders belong to the `day_openings` row that was
`open` when they were created (via `day_opening_id` on orders).

| col                     | type                    | notes                                              |
| ----------------------- | ----------------------- | -------------------------------------------------- |
| id                      | int PK                  |                                                    |
| business_date           | text not null           | `YYYY-MM-DD` in Asia/Riyadh                        |
| status                  | text not null           | `open` \| `closed` — only one `open` row at a time |
| opening_cash_halalas    | int not null, default 0 | float counted at day open                          |
| opened_at               | int not null            |                                                    |
| opened_by               | int FK → users not null |                                                    |
| closed_at               | int null                |                                                    |
| closed_by               | int FK → users, null    |                                                    |
| closing_cash_halalas    | int null                | counted at day close                               |
| total_sales_halalas     | int null                | computed & frozen at close (Z-report)              |
| total_vat_halalas       | int null                |                                                    |
| order_count             | int null                |                                                    |
| created_at / updated_at | int not null            |                                                    |
| created_by / updated_by | int FK → users, null    |                                                    |

## settings

| col   | type          | notes                                                                                                             |
| ----- | ------------- | ----------------------------------------------------------------------------------------------------------------- |
| key   | text PK       | `zatca_csid`, `zatca_private_key`, `zatca_cert`, `daily_order_seq`, `last_icv`, `vat_number`, `seller_name`, etc. |
| value | text not null | sensitive values (private key) stored encrypted                                                                   |

## Deferred

- **Modifiers** (extras, size variants) — add later as `item_modifiers` +
  `order_item_modifiers` once the core flow is stable.
- **Payments table** — initially payment is a status change on the order; split
  into a `payments` table when multiple tenders/partials are needed.

## Reports (derived, no extra tables)

All reports are queries over `orders`, `order_items`, `invoices` and
`day_openings`, scoped by `day_opening_id` / business date:

- **X-report** — mid-day snapshot of the currently open day: sales, VAT,
  order count, by payment status
- **Z-report** — frozen at day close, stored on the `day_openings` row;
  re-printable any time
- **Daily sales** — totals per business day over a date range
- **Per-user sales** — grouped by `orders.created_by`
- **Per-category sales** — grouped via `order_items.item_id` → category,
  falling back to snapshot data if the item was deleted
- **VAT summary** — totals needed for the VAT return (excl. VAT, VAT, incl.
  VAT over a period)

## Entity relationship summary

```
user_roles 1──* users
users 1──* orders (created_by/updated_by everywhere)
day_openings 1──* orders
tables 1──* orders
orders 1──* order_items ──* items (loose, snapshots keep history)
orders 1──* order_audit_log
orders 1──1 invoices
item_categories 1──* items
printers 1──* item_categories (kitchen routing)
```
