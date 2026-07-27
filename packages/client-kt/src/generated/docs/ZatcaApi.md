# ZatcaApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
| ------------- | ------------- | ------------- |
| [**zatcaControllerGenerateCSR**](ZatcaApi.md#zatcaControllerGenerateCSR) | **POST** zatca/onboard/csr | Generate keypair and CSR for ZATCA onboarding |
| [**zatcaControllerGetConfig**](ZatcaApi.md#zatcaControllerGetConfig) | **GET** zatca/config | Get ZATCA seller configuration |
| [**zatcaControllerGetInvoice**](ZatcaApi.md#zatcaControllerGetInvoice) | **GET** zatca/invoices/{id} | Get invoice detail including XML |
| [**zatcaControllerGetStatus**](ZatcaApi.md#zatcaControllerGetStatus) | **GET** zatca/status | Get ZATCA onboarding and status |
| [**zatcaControllerListInvoices**](ZatcaApi.md#zatcaControllerListInvoices) | **GET** zatca/invoices | List ZATCA invoices |
| [**zatcaControllerOnboardCompliance**](ZatcaApi.md#zatcaControllerOnboardCompliance) | **POST** zatca/onboard/compliance | Submit CSR with OTP to ZATCA compliance CSID endpoint |
| [**zatcaControllerOnboardProduction**](ZatcaApi.md#zatcaControllerOnboardProduction) | **POST** zatca/onboard/production | Exchange compliance CSID for production CSID |
| [**zatcaControllerRetryReporting**](ZatcaApi.md#zatcaControllerRetryReporting) | **POST** zatca/reporting/retry | Retry reporting for all pending or a specific invoice |
| [**zatcaControllerRunComplianceCheck**](ZatcaApi.md#zatcaControllerRunComplianceCheck) | **POST** zatca/onboard/compliance-check | Run compliance check by submitting a signed invoice to ZATCA |
| [**zatcaControllerUpdateConfig**](ZatcaApi.md#zatcaControllerUpdateConfig) | **PUT** zatca/config | Update ZATCA seller configuration |



Generate keypair and CSR for ZATCA onboarding

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(ZatcaApi::class.java)

webService.zatcaControllerGenerateCSR()
```

### Parameters
This endpoint does not need any parameter.

### Return type

null (empty response body)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: Not defined


Get ZATCA seller configuration

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(ZatcaApi::class.java)

val result : ZatcaConfigDto = webService.zatcaControllerGetConfig()
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**ZatcaConfigDto**](ZatcaConfigDto.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


Get invoice detail including XML

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(ZatcaApi::class.java)
val id : kotlin.String = id_example // kotlin.String | 

webService.zatcaControllerGetInvoice(id)
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **kotlin.String**|  | |

### Return type

null (empty response body)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: Not defined


Get ZATCA onboarding and status

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(ZatcaApi::class.java)

webService.zatcaControllerGetStatus()
```

### Parameters
This endpoint does not need any parameter.

### Return type

null (empty response body)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: Not defined


List ZATCA invoices

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(ZatcaApi::class.java)
val limit : kotlin.Int = 56 // kotlin.Int | 
val offset : kotlin.Int = 56 // kotlin.Int | 

webService.zatcaControllerListInvoices(limit, offset)
```

### Parameters
| **limit** | **kotlin.Int**|  | [optional] |
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **offset** | **kotlin.Int**|  | [optional] |

### Return type

null (empty response body)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: Not defined


Submit CSR with OTP to ZATCA compliance CSID endpoint

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(ZatcaApi::class.java)

webService.zatcaControllerOnboardCompliance()
```

### Parameters
This endpoint does not need any parameter.

### Return type

null (empty response body)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: Not defined


Exchange compliance CSID for production CSID

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(ZatcaApi::class.java)

webService.zatcaControllerOnboardProduction()
```

### Parameters
This endpoint does not need any parameter.

### Return type

null (empty response body)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: Not defined


Retry reporting for all pending or a specific invoice

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(ZatcaApi::class.java)

webService.zatcaControllerRetryReporting()
```

### Parameters
This endpoint does not need any parameter.

### Return type

null (empty response body)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: Not defined


Run compliance check by submitting a signed invoice to ZATCA

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(ZatcaApi::class.java)

webService.zatcaControllerRunComplianceCheck()
```

### Parameters
This endpoint does not need any parameter.

### Return type

null (empty response body)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: Not defined


Update ZATCA seller configuration

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(ZatcaApi::class.java)
val zatcaConfigDto : ZatcaConfigDto =  // ZatcaConfigDto | 

val result : ZatcaConfigDto = webService.zatcaControllerUpdateConfig(zatcaConfigDto)
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **zatcaConfigDto** | [**ZatcaConfigDto**](ZatcaConfigDto.md)|  | |

### Return type

[**ZatcaConfigDto**](ZatcaConfigDto.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

