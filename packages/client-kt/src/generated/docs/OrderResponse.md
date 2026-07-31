
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
| **documentId** | **kotlin.String** | ZATCA root cbc:ID — the business invoice number |  |
| **isStandardInvoice** | **kotlin.Boolean** | Whether this order is a ZATCA standard invoice |  |
| **createdAt** | **kotlin.Long** |  |  |
| **updatedAt** | **kotlin.Long** |  |  |
| **createdBy** | **kotlin.Long** |  |  |
| **updatedBy** | **kotlin.Long** |  |  |
| **items** | [**kotlin.collections.List&lt;OrderItemResponse&gt;**](OrderItemResponse.md) |  |  |
| **events** | [**kotlin.collections.List&lt;OrderEventResponse&gt;**](OrderEventResponse.md) |  |  |
| **payments** | [**kotlin.collections.List&lt;OrderPaymentResponse&gt;**](OrderPaymentResponse.md) |  |  |
| **zatcaBuyerDetails** | [**ZatcaBuyerDetailsDto**](ZatcaBuyerDetailsDto.md) | ZATCA standard invoice buyer details (JSON) |  [optional] |



