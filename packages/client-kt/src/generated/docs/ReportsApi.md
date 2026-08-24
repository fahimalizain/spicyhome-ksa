# ReportsApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
| ------------- | ------------- | ------------- |
| [**reportsControllerGetItemWiseSales**](ReportsApi.md#reportsControllerGetItemWiseSales) | **GET** reports/item-wise | Item-wise sales (product mix) over a date range |
| [**reportsControllerGetSales**](ReportsApi.md#reportsControllerGetSales) | **GET** reports/sales | Daily sales totals over a date range |
| [**reportsControllerGetSalesRegister**](ReportsApi.md#reportsControllerGetSalesRegister) | **GET** reports/sales-register | Sales register (day-book of invoices and refunds) over a date range |
| [**reportsControllerGetVat**](ReportsApi.md#reportsControllerGetVat) | **GET** reports/vat | VAT summary over a date range (for VAT return) |
| [**reportsControllerGetXReport**](ReportsApi.md#reportsControllerGetXReport) | **GET** reports/x | Live X-report for the current open day |
| [**reportsControllerGetZReport**](ReportsApi.md#reportsControllerGetZReport) | **GET** reports/z/{dayId} | Z-report for a closed day |
| [**reportsControllerPrintXReport**](ReportsApi.md#reportsControllerPrintXReport) | **POST** reports/x/print | Print X-report on receipt printer |
| [**reportsControllerPrintZReport**](ReportsApi.md#reportsControllerPrintZReport) | **POST** reports/z/{dayId}/print | Print Z-report on receipt printer |



Item-wise sales (product mix) over a date range

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(ReportsApi::class.java)
val from : kotlin.String = from_example // kotlin.String | Business date (YYYY-MM-DD Asia/Riyadh service-day label), inclusive start of the window.
val to : kotlin.String = to_example // kotlin.String | Business date (YYYY-MM-DD Asia/Riyadh service-day label), inclusive end of the window.
val type : kotlin.String = type_example // kotlin.String | Filter by parent order type: dine_in | takeaway. Omit → all types.
val partner : kotlin.String = partner_example // kotlin.String | Filter by delivery partner slug on the parent order; 'none' for walk-in orders. Omit → all partners.
val category : kotlin.String = category_example // kotlin.String | Filter by category id (numeric); 'none' for Uncategorized rows only. Omit → all categories.

val result : ItemWiseSalesResponseDto = webService.reportsControllerGetItemWiseSales(from, to, type, partner, category)
```

### Parameters
| **from** | **kotlin.String**| Business date (YYYY-MM-DD Asia/Riyadh service-day label), inclusive start of the window. | |
| **to** | **kotlin.String**| Business date (YYYY-MM-DD Asia/Riyadh service-day label), inclusive end of the window. | |
| **type** | **kotlin.String**| Filter by parent order type: dine_in | takeaway. Omit → all types. | [optional] |
| **partner** | **kotlin.String**| Filter by delivery partner slug on the parent order; &#39;none&#39; for walk-in orders. Omit → all partners. | [optional] |
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **category** | **kotlin.String**| Filter by category id (numeric); &#39;none&#39; for Uncategorized rows only. Omit → all categories. | [optional] |

### Return type

[**ItemWiseSalesResponseDto**](ItemWiseSalesResponseDto.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


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


Sales register (day-book of invoices and refunds) over a date range

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(ReportsApi::class.java)
val from : kotlin.String = from_example // kotlin.String | Business date (YYYY-MM-DD Asia/Riyadh service-day label), inclusive start of the window.
val to : kotlin.String = to_example // kotlin.String | Business date (YYYY-MM-DD Asia/Riyadh service-day label), inclusive end of the window.
val type : kotlin.String = type_example // kotlin.String | Filter by parent order type: dine_in | takeaway. Omit → all types.
val partner : kotlin.String = partner_example // kotlin.String | Filter by delivery partner slug on the parent order; 'none' for walk-in orders. Omit → all partners.
val kind : kotlin.String = kind_example // kotlin.String | Filter by document kind: sale | refund. Omit → both.

val result : SalesRegisterResponseDto = webService.reportsControllerGetSalesRegister(from, to, type, partner, kind)
```

### Parameters
| **from** | **kotlin.String**| Business date (YYYY-MM-DD Asia/Riyadh service-day label), inclusive start of the window. | |
| **to** | **kotlin.String**| Business date (YYYY-MM-DD Asia/Riyadh service-day label), inclusive end of the window. | |
| **type** | **kotlin.String**| Filter by parent order type: dine_in | takeaway. Omit → all types. | [optional] |
| **partner** | **kotlin.String**| Filter by delivery partner slug on the parent order; &#39;none&#39; for walk-in orders. Omit → all partners. | [optional] |
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **kind** | **kotlin.String**| Filter by document kind: sale | refund. Omit → both. | [optional] |

### Return type

[**SalesRegisterResponseDto**](SalesRegisterResponseDto.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


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
val dayId : kotlin.Long = 789 // kotlin.Long | 

webService.reportsControllerGetZReport(dayId)
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **dayId** | **kotlin.Long**|  | |

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
val dayId : kotlin.Long = 789 // kotlin.Long | 

webService.reportsControllerPrintZReport(dayId)
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **dayId** | **kotlin.Long**|  | |

### Return type

null (empty response body)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: Not defined

