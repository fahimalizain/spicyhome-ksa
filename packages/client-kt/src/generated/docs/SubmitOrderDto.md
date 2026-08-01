
# SubmitOrderDto

## Properties
| Name | Type | Description | Notes |
| ------------ | ------------- | ------------- | ------------- |
| **baseUpdatedAt** | **kotlin.Long** | Order updated_at observed by the client; if present it must match the current value or the submit is rejected with 409. |  [optional] |
| **isStandardInvoice** | **kotlin.Boolean** | Enable standard invoice with buyer details for ZATCA |  [optional] |
| **zatcaBuyerDetails** | [**ZatcaBuyerDetailsDto**](ZatcaBuyerDetailsDto.md) | ZATCA standard invoice buyer details (required when isStandardInvoice is true) |  [optional] |



