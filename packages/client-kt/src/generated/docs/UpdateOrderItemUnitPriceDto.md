
# UpdateOrderItemUnitPriceDto

## Properties
| Name | Type | Description | Notes |
| ------------ | ------------- | ------------- | ------------- |
| **baseUpdatedAt** | **kotlin.Long** | Last known orders.updated_at the client hydrated from. Server returns 409 if stale. |  |
| **unitPriceHalalas** | **kotlin.Long** | New VAT-inclusive unit price in halalas (SAR × 100). Must be an integer ≥ the live catalog items.price_halalas (the floor). |  |



