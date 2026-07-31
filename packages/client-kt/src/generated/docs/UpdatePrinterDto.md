
# UpdatePrinterDto

## Properties
| Name | Type | Description | Notes |
| ------------ | ------------- | ------------- | ------------- |
| **name** | **kotlin.String** |  |  [optional] |
| **connectionType** | [**inline**](#ConnectionType) | How to connect to the printer: TCP/IP network or Windows spooler queue. |  [optional] |
| **windowsPrinterName** | **kotlin.String** | Windows printer queue name. Required when connectionType is \&quot;windows\&quot;. |  [optional] |
| **ip** | **kotlin.String** | IP address or hostname. Required when connectionType is \&quot;tcp\&quot;. Can be empty string for windows. |  [optional] |
| **port** | **kotlin.Int** |  |  [optional] |
| **role** | [**inline**](#Role) |  |  [optional] |
| **config** | [**PrinterConfigDto**](PrinterConfigDto.md) | Per-printer configuration (Arabic encoding etc.). |  [optional] |
| **isActive** | **kotlin.Boolean** |  |  [optional] |


<a id="ConnectionType"></a>
## Enum: connectionType
| Name | Value |
| ---- | ----- |
| connectionType | tcp, windows |


<a id="Role"></a>
## Enum: role
| Name | Value |
| ---- | ----- |
| role | receipt, kitchen |



