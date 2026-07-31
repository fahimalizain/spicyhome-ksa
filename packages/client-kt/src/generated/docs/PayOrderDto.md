
# PayOrderDto

## Properties
| Name | Type | Description | Notes |
| ------------ | ------------- | ------------- | ------------- |
| **payments** | [**kotlin.collections.List&lt;PaymentLineDto&gt;**](PaymentLineDto.md) | Payment lines (at least one required) |  |
| **isStandardInvoice** | **kotlin.Boolean** | Enable standard invoice with buyer details for ZATCA |  [optional] |
| **zatcaBuyerDetails** | [**ZatcaBuyerDetailsDto**](ZatcaBuyerDetailsDto.md) | ZATCA standard invoice buyer details (required when isStandardInvoice is true) |  [optional] |



