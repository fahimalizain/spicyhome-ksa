# PromotionsApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
| ------------- | ------------- | ------------- |
| [**promotionsControllerCreate**](PromotionsApi.md#promotionsControllerCreate) | **POST** promotions | Create a promotion (enabled date ranges must not overlap) |
| [**promotionsControllerList**](PromotionsApi.md#promotionsControllerList) | **GET** promotions | List all promotions (including disabled) |
| [**promotionsControllerUpdate**](PromotionsApi.md#promotionsControllerUpdate) | **PATCH** promotions/{id} | Update a promotion (name / nameAr / percentBp / dates / enabled; soft-disable only) |



Create a promotion (enabled date ranges must not overlap)

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(PromotionsApi::class.java)
val createPromotionDto : CreatePromotionDto =  // CreatePromotionDto | 

val result : PromotionResponse = webService.promotionsControllerCreate(createPromotionDto)
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **createPromotionDto** | [**CreatePromotionDto**](CreatePromotionDto.md)|  | |

### Return type

[**PromotionResponse**](PromotionResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


List all promotions (including disabled)

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(PromotionsApi::class.java)

val result : kotlin.collections.List<PromotionResponse> = webService.promotionsControllerList()
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**kotlin.collections.List&lt;PromotionResponse&gt;**](PromotionResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


Update a promotion (name / nameAr / percentBp / dates / enabled; soft-disable only)

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(PromotionsApi::class.java)
val id : kotlin.Int = 56 // kotlin.Int | Promotion id
val updatePromotionDto : UpdatePromotionDto =  // UpdatePromotionDto | 

val result : PromotionResponse = webService.promotionsControllerUpdate(id, updatePromotionDto)
```

### Parameters
| **id** | **kotlin.Int**| Promotion id | |
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **updatePromotionDto** | [**UpdatePromotionDto**](UpdatePromotionDto.md)|  | |

### Return type

[**PromotionResponse**](PromotionResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

