
# UpdateOrderStandardInvoiceDto

## Properties
| Name | Type | Description | Notes |
| ------------ | ------------- | ------------- | ------------- |
| **baseUpdatedAt** | **kotlin.Long** | Last known orders.updated_at the client hydrated from. Server returns 409 if stale. |  |
| **isStandardInvoice** | **kotlin.Boolean** | Enable (true) or clear (false) the ZATCA standard invoice buyer details. |  |
| **zatcaBuyerDetails** | [**ZatcaBuyerDetailsDto**](ZatcaBuyerDetailsDto.md) | ZATCA standard invoice buyer details — required when isStandardInvoice is true; ignored when false. |  [optional] |



