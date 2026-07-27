
# SyncOrderItemsDto

## Properties
| Name | Type | Description | Notes |
| ------------ | ------------- | ------------- | ------------- |
| **baseUpdatedAt** | **kotlin.Long** | Last known orders.updated_at the client hydrated from. Server returns 409 if stale. |  |
| **items** | [**kotlin.collections.List&lt;SyncOrderItemDto&gt;**](SyncOrderItemDto.md) | Full desired cart — missing existing lines are removed |  |



