
# UpdateOrderMetaDto

## Properties
| Name | Type | Description | Notes |
| ------------ | ------------- | ------------- | ------------- |
| **baseUpdatedAt** | **kotlin.Long** | Last known orders.updated_at the client hydrated from. Server returns 409 if stale. |  |
| **type** | [**inline**](#Type) |  |  |
| **tableId** | **kotlin.Long** | Target table (required for dine_in). Ignored and forced to null when type is takeaway. |  [optional] |
| **notes** | **kotlin.String** | Order-level notes (\&quot;Order notes\&quot;). Send null or an empty string to clear. Omit to keep the current value. |  [optional] |


<a id="Type"></a>
## Enum: type
| Name | Value |
| ---- | ----- |
| type | dine_in, takeaway |



