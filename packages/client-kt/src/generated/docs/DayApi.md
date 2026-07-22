# DayApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
| ------------- | ------------- | ------------- |
| [**businessDayControllerCloseDay**](DayApi.md#businessDayControllerCloseDay) | **POST** day/close | Close the current open business day |
| [**businessDayControllerGetCurrent**](DayApi.md#businessDayControllerGetCurrent) | **GET** day/current | Get current open day with live X-report totals |
| [**businessDayControllerGetDay**](DayApi.md#businessDayControllerGetDay) | **GET** day/{id} | Get a business day by ID |
| [**businessDayControllerList**](DayApi.md#businessDayControllerList) | **GET** day | List past business days (paged) |
| [**businessDayControllerOpenDay**](DayApi.md#businessDayControllerOpenDay) | **POST** day/open | Open a new business day |



Close the current open business day

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(DayApi::class.java)
val closeDayDto : CloseDayDto =  // CloseDayDto | 

val result : CloseDayResponse = webService.businessDayControllerCloseDay(closeDayDto)
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **closeDayDto** | [**CloseDayDto**](CloseDayDto.md)|  | |

### Return type

[**CloseDayResponse**](CloseDayResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


Get current open day with live X-report totals

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(DayApi::class.java)

webService.businessDayControllerGetCurrent()
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


Get a business day by ID

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(DayApi::class.java)
val id : java.math.BigDecimal = 8.14 // java.math.BigDecimal | 

val result : DayOpeningResponse = webService.businessDayControllerGetDay(id)
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.math.BigDecimal**|  | |

### Return type

[**DayOpeningResponse**](DayOpeningResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


List past business days (paged)

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(DayApi::class.java)
val page : java.math.BigDecimal = 8.14 // java.math.BigDecimal | 
val limit : java.math.BigDecimal = 8.14 // java.math.BigDecimal | 

webService.businessDayControllerList(page, limit)
```

### Parameters
| **page** | **java.math.BigDecimal**|  | [optional] |
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **limit** | **java.math.BigDecimal**|  | [optional] |

### Return type

null (empty response body)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: Not defined


Open a new business day

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(DayApi::class.java)
val openDayDto : OpenDayDto =  // OpenDayDto | 

val result : DayOpeningResponse = webService.businessDayControllerOpenDay(openDayDto)
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **openDayDto** | [**OpenDayDto**](OpenDayDto.md)|  | |

### Return type

[**DayOpeningResponse**](DayOpeningResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

