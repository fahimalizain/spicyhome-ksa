# ReportsApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
| ------------- | ------------- | ------------- |
| [**reportsControllerGetSales**](ReportsApi.md#reportsControllerGetSales) | **GET** reports/sales | Daily sales totals over a date range |
| [**reportsControllerGetVat**](ReportsApi.md#reportsControllerGetVat) | **GET** reports/vat | VAT summary over a date range (for VAT return) |
| [**reportsControllerGetXReport**](ReportsApi.md#reportsControllerGetXReport) | **GET** reports/x | Live X-report for the current open day |
| [**reportsControllerGetZReport**](ReportsApi.md#reportsControllerGetZReport) | **GET** reports/z/{dayId} | Z-report for a closed day |
| [**reportsControllerPrintXReport**](ReportsApi.md#reportsControllerPrintXReport) | **POST** reports/x/print | Print X-report on receipt printer |
| [**reportsControllerPrintZReport**](ReportsApi.md#reportsControllerPrintZReport) | **POST** reports/z/{dayId}/print | Print Z-report on receipt printer |



Daily sales totals over a date range

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(ReportsApi::class.java)
val from : kotlin.String = from_example // kotlin.String | 
val to : kotlin.String = to_example // kotlin.String | 

webService.reportsControllerGetSales(from, to)
```

### Parameters
| **from** | **kotlin.String**|  | |
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **to** | **kotlin.String**|  | |

### Return type

null (empty response body)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: Not defined


VAT summary over a date range (for VAT return)

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(ReportsApi::class.java)
val from : kotlin.String = from_example // kotlin.String | 
val to : kotlin.String = to_example // kotlin.String | 

webService.reportsControllerGetVat(from, to)
```

### Parameters
| **from** | **kotlin.String**|  | |
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **to** | **kotlin.String**|  | |

### Return type

null (empty response body)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: Not defined


Live X-report for the current open day

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(ReportsApi::class.java)

webService.reportsControllerGetXReport()
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


Z-report for a closed day

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(ReportsApi::class.java)
val dayId : java.math.BigDecimal = 8.14 // java.math.BigDecimal | 

webService.reportsControllerGetZReport(dayId)
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **dayId** | **java.math.BigDecimal**|  | |

### Return type

null (empty response body)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: Not defined


Print X-report on receipt printer

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(ReportsApi::class.java)

webService.reportsControllerPrintXReport()
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


Print Z-report on receipt printer

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(ReportsApi::class.java)
val dayId : java.math.BigDecimal = 8.14 // java.math.BigDecimal | 

webService.reportsControllerPrintZReport(dayId)
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **dayId** | **java.math.BigDecimal**|  | |

### Return type

null (empty response body)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: Not defined

