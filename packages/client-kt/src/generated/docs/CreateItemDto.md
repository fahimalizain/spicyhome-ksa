
# CreateItemDto

## Properties
| Name | Type | Description | Notes |
| ------------ | ------------- | ------------- | ------------- |
| **subcategoryId** | **kotlin.Long** |  |  |
| **name** | **kotlin.String** |  |  |
| **priceHalalas** | **kotlin.Long** | VAT-inclusive price in halalas (23.00 SAR) |  |
| **categoryId** | **kotlin.Long** | Derived from subcategoryId by the server (the subcategory&#39;s parent). Ignored when it conflicts. |  [optional] |
| **nameAr** | **kotlin.String** |  |  [optional] |
| **vatRateBp** | **kotlin.Int** | VAT rate in basis points (1500 &#x3D; 15%) |  [optional] |
| **sortOrder** | **kotlin.Int** |  |  [optional] |
| **isActive** | **kotlin.Boolean** |  |  [optional] |



