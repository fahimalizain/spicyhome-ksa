# MenuApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
| ------------- | ------------- | ------------- |
| [**menuControllerCreateCategory**](MenuApi.md#menuControllerCreateCategory) | **POST** menu/categories | Create a category |
| [**menuControllerCreateItem**](MenuApi.md#menuControllerCreateItem) | **POST** menu/items | Create an item |
| [**menuControllerGetCategory**](MenuApi.md#menuControllerGetCategory) | **GET** menu/categories/{id} | Get category by ID |
| [**menuControllerGetItem**](MenuApi.md#menuControllerGetItem) | **GET** menu/items/{id} | Get item by ID |
| [**menuControllerListCategories**](MenuApi.md#menuControllerListCategories) | **GET** menu/categories | List all categories |
| [**menuControllerListItems**](MenuApi.md#menuControllerListItems) | **GET** menu/items | List all items, optionally filtered by category |
| [**menuControllerUpdateCategory**](MenuApi.md#menuControllerUpdateCategory) | **PUT** menu/categories/{id} | Update a category |
| [**menuControllerUpdateItem**](MenuApi.md#menuControllerUpdateItem) | **PUT** menu/items/{id} | Update an item |



Create a category

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(MenuApi::class.java)
val createCategoryDto : CreateCategoryDto =  // CreateCategoryDto | 

val result : CategoryResponse = webService.menuControllerCreateCategory(createCategoryDto)
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **createCategoryDto** | [**CreateCategoryDto**](CreateCategoryDto.md)|  | |

### Return type

[**CategoryResponse**](CategoryResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


Create an item

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(MenuApi::class.java)
val createItemDto : CreateItemDto =  // CreateItemDto | 

val result : ItemResponse = webService.menuControllerCreateItem(createItemDto)
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **createItemDto** | [**CreateItemDto**](CreateItemDto.md)|  | |

### Return type

[**ItemResponse**](ItemResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


Get category by ID

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(MenuApi::class.java)
val id : java.math.BigDecimal = 8.14 // java.math.BigDecimal | 

val result : CategoryResponse = webService.menuControllerGetCategory(id)
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.math.BigDecimal**|  | |

### Return type

[**CategoryResponse**](CategoryResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


Get item by ID

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(MenuApi::class.java)
val id : java.math.BigDecimal = 8.14 // java.math.BigDecimal | 

val result : ItemResponse = webService.menuControllerGetItem(id)
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.math.BigDecimal**|  | |

### Return type

[**ItemResponse**](ItemResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


List all categories

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(MenuApi::class.java)

val result : kotlin.collections.List<CategoryResponse> = webService.menuControllerListCategories()
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**kotlin.collections.List&lt;CategoryResponse&gt;**](CategoryResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


List all items, optionally filtered by category

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(MenuApi::class.java)
val categoryId : kotlin.String = categoryId_example // kotlin.String | 

val result : kotlin.collections.List<ItemResponse> = webService.menuControllerListItems(categoryId)
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **categoryId** | **kotlin.String**|  | |

### Return type

[**kotlin.collections.List&lt;ItemResponse&gt;**](ItemResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


Update a category

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(MenuApi::class.java)
val id : java.math.BigDecimal = 8.14 // java.math.BigDecimal | 
val updateCategoryDto : UpdateCategoryDto =  // UpdateCategoryDto | 

val result : CategoryResponse = webService.menuControllerUpdateCategory(id, updateCategoryDto)
```

### Parameters
| **id** | **java.math.BigDecimal**|  | |
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **updateCategoryDto** | [**UpdateCategoryDto**](UpdateCategoryDto.md)|  | |

### Return type

[**CategoryResponse**](CategoryResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


Update an item

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(MenuApi::class.java)
val id : java.math.BigDecimal = 8.14 // java.math.BigDecimal | 
val updateItemDto : UpdateItemDto =  // UpdateItemDto | 

val result : ItemResponse = webService.menuControllerUpdateItem(id, updateItemDto)
```

### Parameters
| **id** | **java.math.BigDecimal**|  | |
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **updateItemDto** | [**UpdateItemDto**](UpdateItemDto.md)|  | |

### Return type

[**ItemResponse**](ItemResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

