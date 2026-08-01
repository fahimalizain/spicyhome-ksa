
# UpdateOrderPartnerDto

## Properties
| Name | Type | Description | Notes |
| ------------ | ------------- | ------------- | ------------- |
| **baseUpdatedAt** | **kotlin.Long** | Last known orders.updated_at the client hydrated from. Server returns 409 if stale. |  |
| **deliveryPartnerId** | **kotlin.String** | Delivery partner slug to set, or null to clear the partner (resets line prices to the live catalog). Omit to keep the current partner. |  [optional] |
| **deliveryExternalRef** | **kotlin.String** | Delivery app&#39;s order number for reconciliation. Optional; may be sent alone to edit the ref of an already-linked order. Force-nulled when the partner is cleared or absent. |  [optional] |



