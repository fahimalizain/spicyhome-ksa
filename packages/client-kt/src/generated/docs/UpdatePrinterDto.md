
# UpdatePrinterDto

## Properties
| Name | Type | Description | Notes |
| ------------ | ------------- | ------------- | ------------- |
| **name** | **kotlin.String** |  |  [optional] |
| **ip** | **kotlin.String** |  |  [optional] |
| **port** | **kotlin.Int** |  |  [optional] |
| **role** | [**inline**](#Role) |  |  [optional] |
| **config** | [**PrinterConfigDto**](PrinterConfigDto.md) | Per-printer configuration (Arabic encoding etc.). |  [optional] |
| **isActive** | **kotlin.Boolean** |  |  [optional] |


<a id="Role"></a>
## Enum: role
| Name | Value |
| ---- | ----- |
| role | receipt, kitchen |



