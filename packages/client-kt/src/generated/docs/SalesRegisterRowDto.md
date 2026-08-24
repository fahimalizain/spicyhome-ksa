
# SalesRegisterRowDto

## Properties
| Name | Type | Description | Notes |
| ------------ | ------------- | ------------- | ------------- |
| **kind** | **kotlin.String** | Document kind: sale (invoice) or refund (credit note) |  |
| **postedAt** | **kotlin.Long** | Posting time (Unix seconds): earliest payment for sales, refund creation for refunds |  |
| **businessDate** | **kotlin.String** | Service-day label (Asia/Riyadh) of postedAt — the business date the document posts to |  |
| **documentId** | **kotlin.String** |  |  |
| **orderId** | **kotlin.Long** |  |  |
| **refundId** | **kotlin.Long** | Refund id; null on sale rows |  |
| **orderNo** | **kotlin.Long** | Parent order number (same on refund rows) |  |
| **type** | **kotlin.String** |  |  |
| **tableId** | **kotlin.Long** |  |  |
| **tableName** | **kotlin.String** |  |  |
| **deliveryPartnerId** | **kotlin.String** |  |  |
| **deliveryPartnerTitle** | **kotlin.String** |  |  |
| **deliveryExternalRef** | **kotlin.String** |  |  |
| **subtotalHalalas** | **kotlin.Long** | Sale: order subtotal; refund: negative |  |
| **vatHalalas** | **kotlin.Long** | Sale: order VAT; refund: negative |  |
| **totalHalalas** | **kotlin.Long** | Sale: order total; refund: negative |  |
| **tenders** | [**kotlin.collections.List&lt;SalesRegisterTenderDto&gt;**](SalesRegisterTenderDto.md) | Sale: all order payments; refund: single entry with the refund method |  |
| **cashierUserId** | **kotlin.Long** |  |  |
| **cashierName** | **kotlin.String** | users.name, or \&quot;Unknown\&quot; when the user is gone |  |
| **notes** | **kotlin.String** | Sale: order notes; refund: \&quot;Refund of &lt;parent document id&gt;\&quot; |  |



