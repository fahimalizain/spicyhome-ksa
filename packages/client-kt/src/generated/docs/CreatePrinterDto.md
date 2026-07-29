
# CreatePrinterDto

## Properties
| Name | Type | Description | Notes |
| ------------ | ------------- | ------------- | ------------- |
| **name** | **kotlin.String** |  |  |
| **ip** | **kotlin.String** |  |  |
| **role** | [**inline**](#Role) |  |  |
| **port** | **kotlin.Int** |  |  [optional] |
| **config** | [**PrinterConfigDto**](PrinterConfigDto.md) | Per-printer configuration (Arabic encoding etc.). |  [optional] |
| **isActive** | **kotlin.Boolean** |  |  [optional] |


<a id="Role"></a>
## Enum: role
| Name | Value |
| ---- | ----- |
| role | receipt, kitchen |



