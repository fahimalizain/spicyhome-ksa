
# OrderSummaryResponse

## Properties
| Name | Type | Description | Notes |
| ------------ | ------------- | ------------- | ------------- |
| **id** | **kotlin.Long** |  |  |
| **orderNo** | **kotlin.Long** |  |  |
| **uuid** | **kotlin.String** |  |  |
| **type** | **kotlin.String** |  |  |
| **tableId** | **kotlin.Long** |  |  |
| **dayOpeningId** | **kotlin.Long** |  |  |
| **status** | **kotlin.String** |  |  |
| **subtotalHalalas** | **kotlin.Long** |  |  |
| **vatHalalas** | **kotlin.Long** |  |  |
| **totalHalalas** | **kotlin.Long** |  |  |
| **discountHalalas** | **kotlin.Long** |  |  |
| **deliveryPartnerId** | **kotlin.String** | Delivery partner slug, only set on takeaway orders. Walk-in takeaway and dine-in orders have null. |  |
| **deliveryPartnerTitle** | **kotlin.String** | Delivery partner title (joined from delivery_partners when a partner is set). |  |
| **deliveryExternalRef** | **kotlin.String** | Delivery app&#39;s order number for reconciliation (only meaningful alongside a partner). |  |
| **documentId** | **kotlin.String** | ZATCA root cbc:ID — the business invoice number |  |
| **notes** | **kotlin.String** | Order-level notes (\&quot;Order notes\&quot;). Null when none are set. |  |
| **createdAt** | **kotlin.Long** |  |  |
| **updatedAt** | **kotlin.Long** |  |  |
| **createdBy** | **kotlin.Long** |  |  |
| **updatedBy** | **kotlin.Long** |  |  |



