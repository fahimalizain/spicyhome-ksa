# PrintersApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
| ------------- | ------------- | ------------- |
| [**printersControllerCheckStatus**](PrintersApi.md#printersControllerCheckStatus) | **GET** printers/{id}/status | Check printer TCP reachability |
| [**printersControllerCreate**](PrintersApi.md#printersControllerCreate) | **POST** printers | Create a printer |
| [**printersControllerGet**](PrintersApi.md#printersControllerGet) | **GET** printers/{id} | Get printer by ID |
| [**printersControllerList**](PrintersApi.md#printersControllerList) | **GET** printers | List all printers |
| [**printersControllerTestPrint**](PrintersApi.md#printersControllerTestPrint) | **POST** printers/{id}/test | Print a test ticket |
| [**printersControllerUpdate**](PrintersApi.md#printersControllerUpdate) | **PUT** printers/{id} | Update a printer |



Check printer TCP reachability

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(PrintersApi::class.java)
val id : java.math.BigDecimal = 8.14 // java.math.BigDecimal | 

val result : PrinterStatusResponse = webService.printersControllerCheckStatus(id)
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.math.BigDecimal**|  | |

### Return type

[**PrinterStatusResponse**](PrinterStatusResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


Create a printer

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(PrintersApi::class.java)
val createPrinterDto : CreatePrinterDto =  // CreatePrinterDto | 

val result : PrinterResponse = webService.printersControllerCreate(createPrinterDto)
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **createPrinterDto** | [**CreatePrinterDto**](CreatePrinterDto.md)|  | |

### Return type

[**PrinterResponse**](PrinterResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


Get printer by ID

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(PrintersApi::class.java)
val id : java.math.BigDecimal = 8.14 // java.math.BigDecimal | 

val result : PrinterResponse = webService.printersControllerGet(id)
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.math.BigDecimal**|  | |

### Return type

[**PrinterResponse**](PrinterResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


List all printers

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(PrintersApi::class.java)

val result : kotlin.collections.List<PrinterResponse> = webService.printersControllerList()
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**kotlin.collections.List&lt;PrinterResponse&gt;**](PrinterResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


Print a test ticket

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(PrintersApi::class.java)
val id : java.math.BigDecimal = 8.14 // java.math.BigDecimal | 

val result : SuccessResponse = webService.printersControllerTestPrint(id)
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.math.BigDecimal**|  | |

### Return type

[**SuccessResponse**](SuccessResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


Update a printer

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(PrintersApi::class.java)
val id : java.math.BigDecimal = 8.14 // java.math.BigDecimal | 
val updatePrinterDto : UpdatePrinterDto =  // UpdatePrinterDto | 

val result : PrinterResponse = webService.printersControllerUpdate(id, updatePrinterDto)
```

### Parameters
| **id** | **java.math.BigDecimal**|  | |
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **updatePrinterDto** | [**UpdatePrinterDto**](UpdatePrinterDto.md)|  | |

### Return type

[**PrinterResponse**](PrinterResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

