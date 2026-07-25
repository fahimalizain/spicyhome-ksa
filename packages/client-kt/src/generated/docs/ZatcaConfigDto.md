
# ZatcaConfigDto

## Properties
| Name | Type | Description | Notes |
| ------------ | ------------- | ------------- | ------------- |
| **sellerName** | **kotlin.String** | Legal seller name for CSR and invoice XML |  |
| **vatNumber** | **kotlin.String** | 15-digit KSA VAT number (starts and ends with 3) |  |
| **crNumber** | **kotlin.String** | 10-digit Commercial Registration number |  |
| **street** | **kotlin.String** | Street name |  |
| **building** | **kotlin.String** | Building number |  |
| **city** | **kotlin.String** | City name |  |
| **postalCode** | **kotlin.String** | 5-digit postal code |  |
| **country** | **kotlin.String** | 2-letter ISO country code |  |
| **orgUnit** | **kotlin.String** | Organizational unit for CSR |  |
| **apiBaseUrl** | **kotlin.String** | ZATCA API base URL (defaults to developer portal) |  [optional] |
| **environment** | [**inline**](#Environment) | ZATCA environment — controls CSR OID label (sandbox→TESTZATCA-Code-Signing, simulation→PREZATCA-Code-Signing, production→ZATCA-Code-Signing) |  [optional] |


<a id="Environment"></a>
## Enum: environment
| Name | Value |
| ---- | ----- |
| environment | sandbox, simulation, production |



