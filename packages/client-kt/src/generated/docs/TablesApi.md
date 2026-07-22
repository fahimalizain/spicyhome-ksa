# TablesApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
| ------------- | ------------- | ------------- |
| [**tablesControllerCreate**](TablesApi.md#tablesControllerCreate) | **POST** tables | Create a table |
| [**tablesControllerGet**](TablesApi.md#tablesControllerGet) | **GET** tables/{id} | Get table by ID |
| [**tablesControllerList**](TablesApi.md#tablesControllerList) | **GET** tables | List all tables |
| [**tablesControllerUpdate**](TablesApi.md#tablesControllerUpdate) | **PUT** tables/{id} | Update a table |



Create a table

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(TablesApi::class.java)
val createTableDto : CreateTableDto =  // CreateTableDto | 

val result : TableResponse = webService.tablesControllerCreate(createTableDto)
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **createTableDto** | [**CreateTableDto**](CreateTableDto.md)|  | |

### Return type

[**TableResponse**](TableResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


Get table by ID

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(TablesApi::class.java)
val id : java.math.BigDecimal = 8.14 // java.math.BigDecimal | 

val result : TableResponse = webService.tablesControllerGet(id)
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.math.BigDecimal**|  | |

### Return type

[**TableResponse**](TableResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


List all tables

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(TablesApi::class.java)

val result : kotlin.collections.List<TableResponse> = webService.tablesControllerList()
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**kotlin.collections.List&lt;TableResponse&gt;**](TableResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


Update a table

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(TablesApi::class.java)
val id : java.math.BigDecimal = 8.14 // java.math.BigDecimal | 
val updateTableDto : UpdateTableDto =  // UpdateTableDto | 

val result : TableResponse = webService.tablesControllerUpdate(id, updateTableDto)
```

### Parameters
| **id** | **java.math.BigDecimal**|  | |
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **updateTableDto** | [**UpdateTableDto**](UpdateTableDto.md)|  | |

### Return type

[**TableResponse**](TableResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

