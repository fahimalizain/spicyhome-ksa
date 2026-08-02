
# SubmitOrderDto

## Properties
| Name | Type | Description | Notes |
| ------------ | ------------- | ------------- | ------------- |
| **baseUpdatedAt** | **kotlin.Long** | Order updated_at observed by the client; if present it must match the current value or the submit is rejected with 409. |  [optional] |
| **isStandardInvoice** | **kotlin.Boolean** | Enable standard invoice with buyer details for ZATCA |  [optional] |
| **zatcaBuyerDetails** | [**ZatcaBuyerDetailsDto**](ZatcaBuyerDetailsDto.md) | ZATCA standard invoice buyer details (required when isStandardInvoice is true) |  [optional] |
| **printReceipt** | **kotlin.Boolean** | Controls the automatic receipt print on submit for SIMPLIFIED invoices only. Defaults to true when omitted (current behavior). When false on a simplified invoice, the receipt print is skipped (no receipt_print_enqueued event and no physical print), but if a positive cash payment exists the cash drawer is still kicked. IGNORED for standard invoices: their receipt is always deferred until ZATCA clearance, and the cash drawer is kicked on submit for cash orders regardless of this flag. |  [optional] |



