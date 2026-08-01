# MenuApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
| ------------- | ------------- | ------------- |
| [**menuControllerCreateCategory**](MenuApi.md#menuControllerCreateCategory) | **POST** menu/categories | Create a category |
| [**menuControllerCreateItem**](MenuApi.md#menuControllerCreateItem) | **POST** menu/items | Create an item |
| [**menuControllerCreateSubcategory**](MenuApi.md#menuControllerCreateSubcategory) | **POST** menu/subcategories | Create a sub-category |
| [**menuControllerGetCategory**](MenuApi.md#menuControllerGetCategory) | **GET** menu/categories/{id} | Get category by ID |
| [**menuControllerGetItem**](MenuApi.md#menuControllerGetItem) | **GET** menu/items/{id} | Get item by ID |
| [**menuControllerGetSubcategory**](MenuApi.md#menuControllerGetSubcategory) | **GET** menu/subcategories/{id} | Get sub-category by ID |
| [**menuControllerListCategories**](MenuApi.md#menuControllerListCategories) | **GET** menu/categories | List all categories |
| [**menuControllerListItems**](MenuApi.md#menuControllerListItems) | **GET** menu/items | List all items, optionally filtered by category or sub-category |
| [**menuControllerListSubcategories**](MenuApi.md#menuControllerListSubcategories) | **GET** menu/subcategories | List all sub-categories, optionally filtered by category |
| [**menuControllerUpdateCategory**](MenuApi.md#menuControllerUpdateCategory) | **PUT** menu/categories/{id} | Update a category |
| [**menuControllerUpdateItem**](MenuApi.md#menuControllerUpdateItem) | **PUT** menu/items/{id} | Update an item |
| [**menuControllerUpdateSubcategory**](MenuApi.md#menuControllerUpdateSubcategory) | **PUT** menu/subcategories/{id} | Update a sub-category |



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


Create a sub-category

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(MenuApi::class.java)
val createSubcategoryDto : CreateSubcategoryDto =  // CreateSubcategoryDto | 

val result : SubcategoryResponse = webService.menuControllerCreateSubcategory(createSubcategoryDto)
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **createSubcategoryDto** | [**CreateSubcategoryDto**](CreateSubcategoryDto.md)|  | |

### Return type

[**SubcategoryResponse**](SubcategoryResponse.md)

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
val id : kotlin.Long = 789 // kotlin.Long | 

val result : CategoryResponse = webService.menuControllerGetCategory(id)
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **kotlin.Long**|  | |

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
val id : kotlin.Long = 789 // kotlin.Long | 

val result : ItemResponse = webService.menuControllerGetItem(id)
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **kotlin.Long**|  | |

### Return type

[**ItemResponse**](ItemResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


Get sub-category by ID

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(MenuApi::class.java)
val id : kotlin.Long = 789 // kotlin.Long | 

val result : SubcategoryResponse = webService.menuControllerGetSubcategory(id)
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **kotlin.Long**|  | |

### Return type

[**SubcategoryResponse**](SubcategoryResponse.md)

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


List all items, optionally filtered by category or sub-category

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
val subcategoryId : kotlin.String = subcategoryId_example // kotlin.String | 

val result : kotlin.collections.List<ItemResponse> = webService.menuControllerListItems(categoryId, subcategoryId)
```

### Parameters
| **categoryId** | **kotlin.String**|  | |
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **subcategoryId** | **kotlin.String**|  | |

### Return type

[**kotlin.collections.List&lt;ItemResponse&gt;**](ItemResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


List all sub-categories, optionally filtered by category

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

val result : kotlin.collections.List<SubcategoryResponse> = webService.menuControllerListSubcategories(categoryId)
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **categoryId** | **kotlin.String**|  | |

### Return type

[**kotlin.collections.List&lt;SubcategoryResponse&gt;**](SubcategoryResponse.md)

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
val id : kotlin.Long = 789 // kotlin.Long | 
val updateCategoryDto : UpdateCategoryDto =  // UpdateCategoryDto | 

val result : CategoryResponse = webService.menuControllerUpdateCategory(id, updateCategoryDto)
```

### Parameters
| **id** | **kotlin.Long**|  | |
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
val id : kotlin.Long = 789 // kotlin.Long | 
val updateItemDto : UpdateItemDto =  // UpdateItemDto | 

val result : ItemResponse = webService.menuControllerUpdateItem(id, updateItemDto)
```

### Parameters
| **id** | **kotlin.Long**|  | |
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


Update a sub-category

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(MenuApi::class.java)
val id : kotlin.Long = 789 // kotlin.Long | 
val updateSubcategoryDto : UpdateSubcategoryDto =  // UpdateSubcategoryDto | 

val result : SubcategoryResponse = webService.menuControllerUpdateSubcategory(id, updateSubcategoryDto)
```

### Parameters
| **id** | **kotlin.Long**|  | |
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **updateSubcategoryDto** | [**UpdateSubcategoryDto**](UpdateSubcategoryDto.md)|  | |

### Return type

[**SubcategoryResponse**](SubcategoryResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

