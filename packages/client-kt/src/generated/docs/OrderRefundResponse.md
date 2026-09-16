
# OrderRefundResponse

## Properties
| Name | Type | Description | Notes |
| ------------ | ------------- | ------------- | ------------- |
| **id** | **kotlin.Long** |  |  |
| **orderId** | **kotlin.Long** |  |  |
| **userId** | **kotlin.Long** |  |  |
| **methodId** | **kotlin.String** | Payment method slug used for this refund |  |
| **methodTitle** | **kotlin.String** | Payment method title snapshot at refund time |  |
| **zatcaPaymentMeansCode** | **kotlin.String** | ZATCA UN/ECE 4461 Payment Means code snapshot at refund time |  |
| **subtotalHalalas** | **kotlin.Long** |  |  |
| **vatHalalas** | **kotlin.Long** |  |  |
| **totalHalalas** | **kotlin.Long** |  |  |
| **discountHalalas** | **kotlin.Long** | Inclusive Discount share allocated to this refund (halalas). 0 when the order had no Promotion. |  |
| **reason** | **kotlin.String** |  |  |
| **documentId** | **kotlin.String** | Refund document ID |  |
| **createdAt** | **kotlin.Long** |  |  |
| **items** | [**kotlin.collections.List&lt;RefundItemResponse&gt;**](RefundItemResponse.md) |  |  |



