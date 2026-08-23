
# ZatcaConfigDto

## Properties
| Name | Type | Description | Notes |
| ------------ | ------------- | ------------- | ------------- |
| **sellerName** | **kotlin.String** | English / Latin seller display name (receipts, admin). Not used for ZATCA RegistrationName or CSR organizationName |  |
| **sellerNameAr** | **kotlin.String** | Arabic legal seller name for ZATCA invoice XML RegistrationName, QR TLV tag 1, and CSR organizationName |  |
| **sellerStreetAr** | **kotlin.String** | Arabic street name |  |
| **sellerCityAr** | **kotlin.String** | Arabic city name |  |
| **sellerDistrictAr** | **kotlin.String** | Arabic district name (receipts only — not used in ZATCA XML or CSR) |  |
| **vatNumber** | **kotlin.String** | 15-digit KSA VAT number (starts and ends with 3) |  |
| **crNumber** | **kotlin.String** | 10-digit Commercial Registration number |  |
| **street** | **kotlin.String** | Street name |  |
| **building** | **kotlin.String** | Building number |  |
| **city** | **kotlin.String** | City name |  |
| **sellerDistrict** | **kotlin.String** | District name (receipts only — not used in ZATCA XML or CSR) |  |
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



