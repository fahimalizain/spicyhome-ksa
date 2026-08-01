# DeliveryPartnersApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
| ------------- | ------------- | ------------- |
| [**deliveryPartnersControllerCreate**](DeliveryPartnersApi.md#deliveryPartnersControllerCreate) | **POST** delivery-partners | Create a delivery partner (atomically creates its owned payment method) |
| [**deliveryPartnersControllerList**](DeliveryPartnersApi.md#deliveryPartnersControllerList) | **GET** delivery-partners | List all delivery partners (including disabled) |
| [**deliveryPartnersControllerListEnabled**](DeliveryPartnersApi.md#deliveryPartnersControllerListEnabled) | **GET** delivery-partners/enabled | List enabled delivery partners (no special permission required) |
| [**deliveryPartnersControllerUpdate**](DeliveryPartnersApi.md#deliveryPartnersControllerUpdate) | **PATCH** delivery-partners/{id} | Update a delivery partner (title / enabled / sort_order; mirrors title + enabled to the owned payment method) |



Create a delivery partner (atomically creates its owned payment method)

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(DeliveryPartnersApi::class.java)
val createDeliveryPartnerDto : CreateDeliveryPartnerDto =  // CreateDeliveryPartnerDto | 

val result : DeliveryPartnerResponse = webService.deliveryPartnersControllerCreate(createDeliveryPartnerDto)
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **createDeliveryPartnerDto** | [**CreateDeliveryPartnerDto**](CreateDeliveryPartnerDto.md)|  | |

### Return type

[**DeliveryPartnerResponse**](DeliveryPartnerResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


List all delivery partners (including disabled)

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(DeliveryPartnersApi::class.java)

val result : kotlin.collections.List<DeliveryPartnerResponse> = webService.deliveryPartnersControllerList()
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**kotlin.collections.List&lt;DeliveryPartnerResponse&gt;**](DeliveryPartnerResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


List enabled delivery partners (no special permission required)

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(DeliveryPartnersApi::class.java)

val result : kotlin.collections.List<DeliveryPartnerResponse> = webService.deliveryPartnersControllerListEnabled()
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**kotlin.collections.List&lt;DeliveryPartnerResponse&gt;**](DeliveryPartnerResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


Update a delivery partner (title / enabled / sort_order; mirrors title + enabled to the owned payment method)

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(DeliveryPartnersApi::class.java)
val id : kotlin.String = id_example // kotlin.String | Delivery partner slug
val updateDeliveryPartnerDto : UpdateDeliveryPartnerDto =  // UpdateDeliveryPartnerDto | 

val result : DeliveryPartnerResponse = webService.deliveryPartnersControllerUpdate(id, updateDeliveryPartnerDto)
```

### Parameters
| **id** | **kotlin.String**| Delivery partner slug | |
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **updateDeliveryPartnerDto** | [**UpdateDeliveryPartnerDto**](UpdateDeliveryPartnerDto.md)|  | |

### Return type

[**DeliveryPartnerResponse**](DeliveryPartnerResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

