# PaymentMethodsApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
| ------------- | ------------- | ------------- |
| [**paymentMethodsControllerCreate**](PaymentMethodsApi.md#paymentMethodsControllerCreate) | **POST** payment-methods | Create a payment method |
| [**paymentMethodsControllerList**](PaymentMethodsApi.md#paymentMethodsControllerList) | **GET** payment-methods | List all payment methods (including disabled) |
| [**paymentMethodsControllerListEnabled**](PaymentMethodsApi.md#paymentMethodsControllerListEnabled) | **GET** payment-methods/enabled | List enabled payment methods (no special permission required) |
| [**paymentMethodsControllerUpdate**](PaymentMethodsApi.md#paymentMethodsControllerUpdate) | **PATCH** payment-methods/{id} | Update a payment method |



Create a payment method

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(PaymentMethodsApi::class.java)
val createPaymentMethodDto : CreatePaymentMethodDto =  // CreatePaymentMethodDto | 

val result : PaymentMethodResponse = webService.paymentMethodsControllerCreate(createPaymentMethodDto)
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **createPaymentMethodDto** | [**CreatePaymentMethodDto**](CreatePaymentMethodDto.md)|  | |

### Return type

[**PaymentMethodResponse**](PaymentMethodResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


List all payment methods (including disabled)

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(PaymentMethodsApi::class.java)

val result : kotlin.collections.List<PaymentMethodResponse> = webService.paymentMethodsControllerList()
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**kotlin.collections.List&lt;PaymentMethodResponse&gt;**](PaymentMethodResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


List enabled payment methods (no special permission required)

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(PaymentMethodsApi::class.java)

val result : kotlin.collections.List<PaymentMethodResponse> = webService.paymentMethodsControllerListEnabled()
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**kotlin.collections.List&lt;PaymentMethodResponse&gt;**](PaymentMethodResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


Update a payment method

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(PaymentMethodsApi::class.java)
val id : kotlin.String = id_example // kotlin.String | Payment method slug
val updatePaymentMethodDto : UpdatePaymentMethodDto =  // UpdatePaymentMethodDto | 

val result : PaymentMethodResponse = webService.paymentMethodsControllerUpdate(id, updatePaymentMethodDto)
```

### Parameters
| **id** | **kotlin.String**| Payment method slug | |
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **updatePaymentMethodDto** | [**UpdatePaymentMethodDto**](UpdatePaymentMethodDto.md)|  | |

### Return type

[**PaymentMethodResponse**](PaymentMethodResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

