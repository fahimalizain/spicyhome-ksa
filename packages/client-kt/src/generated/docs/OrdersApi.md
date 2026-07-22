# OrdersApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
| ------------- | ------------- | ------------- |
| [**ordersControllerAddItem**](OrdersApi.md#ordersControllerAddItem) | **POST** orders/{id}/items | Add an item to an order |
| [**ordersControllerCreateOrder**](OrdersApi.md#ordersControllerCreateOrder) | **POST** orders | Create a new order |
| [**ordersControllerGetOrder**](OrdersApi.md#ordersControllerGetOrder) | **GET** orders/{id} | Get order by ID with items and audit log |
| [**ordersControllerListOrders**](OrdersApi.md#ordersControllerListOrders) | **GET** orders | List orders with optional filters |
| [**ordersControllerPayOrder**](OrdersApi.md#ordersControllerPayOrder) | **POST** orders/{id}/pay | Mark order as paid (sent → paid) |
| [**ordersControllerRemoveItem**](OrdersApi.md#ordersControllerRemoveItem) | **DELETE** orders/{orderId}/items/{itemId} | Remove an item from an order |
| [**ordersControllerSendOrder**](OrdersApi.md#ordersControllerSendOrder) | **POST** orders/{id}/send | Send order to kitchen (open → sent) |
| [**ordersControllerUpdateItem**](OrdersApi.md#ordersControllerUpdateItem) | **PATCH** orders/{orderId}/items/{itemId} | Update an order item (qty or notes) |
| [**ordersControllerVerifyAuditChain**](OrdersApi.md#ordersControllerVerifyAuditChain) | **GET** orders/{id}/audit/verify | Verify audit log hash chain for an order |
| [**ordersControllerVoidOrder**](OrdersApi.md#ordersControllerVoidOrder) | **POST** orders/{id}/void | Void an order (open|sent → voided) |



Add an item to an order

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(OrdersApi::class.java)
val id : java.math.BigDecimal = 8.14 // java.math.BigDecimal | 
val addOrderItemDto : AddOrderItemDto =  // AddOrderItemDto | 

val result : SuccessResponse = webService.ordersControllerAddItem(id, addOrderItemDto)
```

### Parameters
| **id** | **java.math.BigDecimal**|  | |
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **addOrderItemDto** | [**AddOrderItemDto**](AddOrderItemDto.md)|  | |

### Return type

[**SuccessResponse**](SuccessResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


Create a new order

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(OrdersApi::class.java)
val createOrderDto : CreateOrderDto =  // CreateOrderDto | 

val result : CreateOrderResponse = webService.ordersControllerCreateOrder(createOrderDto)
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **createOrderDto** | [**CreateOrderDto**](CreateOrderDto.md)|  | |

### Return type

[**CreateOrderResponse**](CreateOrderResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


Get order by ID with items and audit log

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(OrdersApi::class.java)
val id : java.math.BigDecimal = 8.14 // java.math.BigDecimal | 

val result : OrderResponse = webService.ordersControllerGetOrder(id)
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.math.BigDecimal**|  | |

### Return type

[**OrderResponse**](OrderResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


List orders with optional filters

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(OrdersApi::class.java)
val status : kotlin.String = status_example // kotlin.String | 
val date : kotlin.String = date_example // kotlin.String | 

val result : kotlin.collections.List<OrderResponse> = webService.ordersControllerListOrders(status, date)
```

### Parameters
| **status** | **kotlin.String**|  | |
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **date** | **kotlin.String**|  | |

### Return type

[**kotlin.collections.List&lt;OrderResponse&gt;**](OrderResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


Mark order as paid (sent → paid)

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(OrdersApi::class.java)
val id : java.math.BigDecimal = 8.14 // java.math.BigDecimal | 

val result : StatusResponse = webService.ordersControllerPayOrder(id)
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.math.BigDecimal**|  | |

### Return type

[**StatusResponse**](StatusResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


Remove an item from an order

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(OrdersApi::class.java)
val orderId : java.math.BigDecimal = 8.14 // java.math.BigDecimal | 
val itemId : java.math.BigDecimal = 8.14 // java.math.BigDecimal | 

val result : SuccessResponse = webService.ordersControllerRemoveItem(orderId, itemId)
```

### Parameters
| **orderId** | **java.math.BigDecimal**|  | |
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **itemId** | **java.math.BigDecimal**|  | |

### Return type

[**SuccessResponse**](SuccessResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


Send order to kitchen (open → sent)

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(OrdersApi::class.java)
val id : java.math.BigDecimal = 8.14 // java.math.BigDecimal | 

val result : StatusResponse = webService.ordersControllerSendOrder(id)
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.math.BigDecimal**|  | |

### Return type

[**StatusResponse**](StatusResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


Update an order item (qty or notes)

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(OrdersApi::class.java)
val orderId : java.math.BigDecimal = 8.14 // java.math.BigDecimal | 
val itemId : java.math.BigDecimal = 8.14 // java.math.BigDecimal | 
val updateOrderItemDto : UpdateOrderItemDto =  // UpdateOrderItemDto | 

val result : SuccessResponse = webService.ordersControllerUpdateItem(orderId, itemId, updateOrderItemDto)
```

### Parameters
| **orderId** | **java.math.BigDecimal**|  | |
| **itemId** | **java.math.BigDecimal**|  | |
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **updateOrderItemDto** | [**UpdateOrderItemDto**](UpdateOrderItemDto.md)|  | |

### Return type

[**SuccessResponse**](SuccessResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


Verify audit log hash chain for an order

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(OrdersApi::class.java)
val id : java.math.BigDecimal = 8.14 // java.math.BigDecimal | 

val result : AuditVerifyResponse = webService.ordersControllerVerifyAuditChain(id)
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.math.BigDecimal**|  | |

### Return type

[**AuditVerifyResponse**](AuditVerifyResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


Void an order (open|sent → voided)

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(OrdersApi::class.java)
val id : java.math.BigDecimal = 8.14 // java.math.BigDecimal | 

val result : StatusResponse = webService.ordersControllerVoidOrder(id)
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.math.BigDecimal**|  | |

### Return type

[**StatusResponse**](StatusResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

