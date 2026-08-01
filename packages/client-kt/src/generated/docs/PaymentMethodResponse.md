
# PaymentMethodResponse

## Properties
| Name | Type | Description | Notes |
| ------------ | ------------- | ------------- | ------------- |
| **id** | **kotlin.String** |  |  |
| **title** | **kotlin.String** |  |  |
| **zatcaPaymentMeansCode** | **kotlin.String** | ZATCA UN/ECE 4461 Payment Means code (allow-list: 10, 30, 42, 48, 1) |  |
| **enabled** | **kotlin.Boolean** |  |  |
| **sortOrder** | **kotlin.Int** |  |  |
| **isDeliveryPartner** | **kotlin.Boolean** | Derived flag: true when this method is owned by a delivery partner (its id exists in delivery_partners, ADR 0007). Not a stored column. |  |
| **createdAt** | **kotlin.Long** |  |  |
| **updatedAt** | **kotlin.Long** |  |  |
| **createdBy** | **kotlin.Long** |  |  |
| **updatedBy** | **kotlin.Long** |  |  |



