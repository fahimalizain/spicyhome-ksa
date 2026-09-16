
# OrderResponse

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
| **promotionId** | **kotlin.Long** | Stamped Promotion id when an enabled campaign covered the order create service day. Null when none. |  |
| **promotionName** | **kotlin.String** | Promotion name snapshot at attach time (does not live-refresh). |  |
| **promotionNameAr** | **kotlin.String** | Promotion Arabic name snapshot at attach time. |  |
| **promotionPercentBp** | **kotlin.Long** | Promotion percent in basis points stamped at attach (1000 &#x3D; 10%). Discount recomputes from this; admin edits do not rewrite open orders. |  |
| **deliveryPartnerId** | **kotlin.String** | Delivery partner slug, only set on takeaway orders. Walk-in takeaway and dine-in orders have null. |  |
| **deliveryPartnerTitle** | **kotlin.String** | Delivery partner title (joined from delivery_partners when a partner is set). |  |
| **deliveryExternalRef** | **kotlin.String** | Delivery app&#39;s order number for reconciliation (only meaningful alongside a partner). |  |
| **documentId** | **kotlin.String** | ZATCA root cbc:ID — the business invoice number |  |
| **notes** | **kotlin.String** | Order-level notes (\&quot;Order notes\&quot;). Null when none are set. |  |
| **isStandardInvoice** | **kotlin.Boolean** | Whether this order is a ZATCA standard invoice |  |
| **createdAt** | **kotlin.Long** |  |  |
| **updatedAt** | **kotlin.Long** |  |  |
| **createdBy** | **kotlin.Long** |  |  |
| **updatedBy** | **kotlin.Long** |  |  |
| **items** | [**kotlin.collections.List&lt;OrderItemResponse&gt;**](OrderItemResponse.md) |  |  |
| **events** | [**kotlin.collections.List&lt;OrderEventResponse&gt;**](OrderEventResponse.md) |  |  |
| **payments** | [**kotlin.collections.List&lt;OrderPaymentResponse&gt;**](OrderPaymentResponse.md) |  |  |
| **zatcaBuyerDetails** | [**ZatcaBuyerDetailsDto**](ZatcaBuyerDetailsDto.md) | ZATCA standard invoice buyer details (JSON) |  [optional] |



