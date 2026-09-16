# SpicyHome POS

Restaurant point-of-sale for Saudi Arabia: orders, payments, kitchen tickets,
ZATCA-compliant invoicing, and business-day cash sessions. Operates on
Asia/Riyadh (+03:00) time.

## Language

### Days and sessions

**Service Day**:
Operational day window [D 05:00, (D+1) 05:00) Asia/Riyadh; label D is the start date. Times before 05:00 belong to the previous service day.
_Avoid_: calendar day (when meaning the ops day), business date (as a time window)

**Business Day**:
Cash open/close session (day_openings) for one service-day label. Orders attach via day_opening_id.
_Avoid_: treating it as calendar midnight; conflating with ZATCA issue date

**Business Date**:
The YYYY-MM-DD service-day label stored on day_openings.business_date.
_Avoid_: ZATCA IssueDate, calendar today

### Pricing

**Promotion**:
A dated percentage campaign that auto-applies to orders. Its dates are Business Dates (e.g. KSA National Day, 10%, 2026-09-23 through 2026-09-25).
_Avoid_: discount (for the rule), offer, coupon, deal; calendar midnight windows

**Discount**:
The VAT-inclusive monetary reduction on an Order produced by applying a Promotion. The customer pays the order total minus this amount.
_Avoid_: promotion (for the amount), allowance (except in ZATCA XML)

**Allowance**:
The VAT-exclusive view of a Discount, used only on the ZATCA tax invoice.
_Avoid_: treating this as the customer-facing Discount; putting Discount amounts straight into XML
