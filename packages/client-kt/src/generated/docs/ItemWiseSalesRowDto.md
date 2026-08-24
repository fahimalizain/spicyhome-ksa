
# ItemWiseSalesRowDto

## Properties
| Name | Type | Description | Notes |
| ------------ | ------------- | ------------- | ------------- |
| **itemId** | **kotlin.Long** | Catalog item id; null when the catalog item was deleted and lines group by snapshot name |  |
| **itemName** | **kotlin.String** | Current catalog items.name when the item still exists, else the order/refund line snapshot name |  |
| **categoryId** | **kotlin.Long** |  |  |
| **categoryName** | **kotlin.String** | &#39;Uncategorized&#39; when categoryId is null or the category is gone |  |
| **qtySold** | **kotlin.Int** | Sum of invoice line qty in range |  |
| **grossHalalas** | **kotlin.Long** | Sum of invoice line total_halalas (VAT-inclusive) in range |  |
| **refundedQty** | **kotlin.Int** | Sum of refund line qty in range |  |
| **refundedHalalas** | **kotlin.Long** | Sum of refund line total_halalas in range |  |
| **netQty** | **kotlin.Int** | qtySold − refundedQty |  |
| **netHalalas** | **kotlin.Long** | grossHalalas − refundedHalalas |  |
| **vatHalalas** | **kotlin.Long** | Net VAT: sold line VAT minus refund line VAT (decomposed per line) |  |



