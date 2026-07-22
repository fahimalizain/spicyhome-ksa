# ZatcaApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
| ------------- | ------------- | ------------- |
| [**zatcaControllerGenerateCSR**](ZatcaApi.md#zatcaControllerGenerateCSR) | **POST** zatca/onboard/csr | Generate keypair and CSR for ZATCA onboarding |
| [**zatcaControllerGetInvoice**](ZatcaApi.md#zatcaControllerGetInvoice) | **GET** zatca/invoices/{id} | Get invoice detail including XML |
| [**zatcaControllerGetStatus**](ZatcaApi.md#zatcaControllerGetStatus) | **GET** zatca/status | Get ZATCA onboarding and status |
| [**zatcaControllerListInvoices**](ZatcaApi.md#zatcaControllerListInvoices) | **GET** zatca/invoices | List ZATCA invoices |
| [**zatcaControllerOnboardCompliance**](ZatcaApi.md#zatcaControllerOnboardCompliance) | **POST** zatca/onboard/compliance | Submit CSR with OTP to ZATCA compliance CSID endpoint |
| [**zatcaControllerOnboardProduction**](ZatcaApi.md#zatcaControllerOnboardProduction) | **POST** zatca/onboard/production | Exchange compliance CSID for production CSID |
| [**zatcaControllerRetryReporting**](ZatcaApi.md#zatcaControllerRetryReporting) | **POST** zatca/reporting/retry | Retry reporting for all pending or a specific invoice |



Generate keypair and CSR for ZATCA onboarding

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
val webService = apiClient.createWebservice(ZatcaApi::class.java)

webService.zatcaControllerGenerateCSR()
```

### Parameters
This endpoint does not need any parameter.

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: Not defined


Get invoice detail including XML

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
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

No authorization required

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
val webService = apiClient.createWebservice(ZatcaApi::class.java)

webService.zatcaControllerGetStatus()
```

### Parameters
This endpoint does not need any parameter.

### Return type

null (empty response body)

### Authorization

No authorization required

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
val webService = apiClient.createWebservice(ZatcaApi::class.java)
val limit : java.math.BigDecimal = 8.14 // java.math.BigDecimal | 
val offset : java.math.BigDecimal = 8.14 // java.math.BigDecimal | 

webService.zatcaControllerListInvoices(limit, offset)
```

### Parameters
| **limit** | **java.math.BigDecimal**|  | |
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **offset** | **java.math.BigDecimal**|  | |

### Return type

null (empty response body)

### Authorization

No authorization required

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
val webService = apiClient.createWebservice(ZatcaApi::class.java)

webService.zatcaControllerOnboardCompliance()
```

### Parameters
This endpoint does not need any parameter.

### Return type

null (empty response body)

### Authorization

No authorization required

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
val webService = apiClient.createWebservice(ZatcaApi::class.java)

webService.zatcaControllerOnboardProduction()
```

### Parameters
This endpoint does not need any parameter.

### Return type

null (empty response body)

### Authorization

No authorization required

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
val webService = apiClient.createWebservice(ZatcaApi::class.java)

webService.zatcaControllerRetryReporting()
```

### Parameters
This endpoint does not need any parameter.

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: Not defined

