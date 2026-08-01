
# UpdateOrderMetaDto

## Properties
| Name | Type | Description | Notes |
| ------------ | ------------- | ------------- | ------------- |
| **baseUpdatedAt** | **kotlin.Long** | Last known orders.updated_at the client hydrated from. Server returns 409 if stale. |  |
| **type** | [**inline**](#Type) |  |  |
| **tableId** | **kotlin.Long** | Target table (required for dine_in). Ignored and forced to null when type is takeaway. |  [optional] |


<a id="Type"></a>
## Enum: type
| Name | Value |
| ---- | ----- |
| type | dine_in, takeaway |



