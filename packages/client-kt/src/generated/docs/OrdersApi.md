# OrdersApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
| ------------- | ------------- | ------------- |
| [**ordersControllerAddItem**](OrdersApi.md#ordersControllerAddItem) | **POST** orders/{id}/items | Add an item to an order |
| [**ordersControllerCreateOrder**](OrdersApi.md#ordersControllerCreateOrder) | **POST** orders | Create a new order |
| [**ordersControllerGetOrder**](OrdersApi.md#ordersControllerGetOrder) | **GET** orders/{id} | Get order by ID with items and audit log |
| [**ordersControllerGetOrderEvents**](OrdersApi.md#ordersControllerGetOrderEvents) | **GET** orders/{id}/events | Get the complete event chain for an order |
| [**ordersControllerGetOrderRefunds**](OrdersApi.md#ordersControllerGetOrderRefunds) | **GET** orders/{id}/refunds | Get all refunds for an order |
| [**ordersControllerListOrders**](OrdersApi.md#ordersControllerListOrders) | **GET** orders | List orders with optional filters |
| [**ordersControllerPayOrder**](OrdersApi.md#ordersControllerPayOrder) | **POST** orders/{id}/pay | Mark order as paid (open → paid) |
| [**ordersControllerRefundOrder**](OrdersApi.md#ordersControllerRefundOrder) | **POST** orders/{id}/refund | Refund items on a paid order |
| [**ordersControllerRemoveItem**](OrdersApi.md#ordersControllerRemoveItem) | **DELETE** orders/{orderId}/items/{itemId} | Remove an item from an order |
| [**ordersControllerReprintOrder**](OrdersApi.md#ordersControllerReprintOrder) | **POST** orders/{id}/print | Reprint receipt or kitchen ticket for an order |
| [**ordersControllerUpdateItem**](OrdersApi.md#ordersControllerUpdateItem) | **PATCH** orders/{orderId}/items/{itemId} | Update an order item (qty or notes) |
| [**ordersControllerVerifyAuditChain**](OrdersApi.md#ordersControllerVerifyAuditChain) | **GET** orders/{id}/audit/verify | Verify audit log hash chain for an order |
| [**ordersControllerVerifyOrderChain**](OrdersApi.md#ordersControllerVerifyOrderChain) | **GET** orders/{id}/events/verify | Verify the hash chain integrity for an order |
| [**ordersControllerVoidOrder**](OrdersApi.md#ordersControllerVoidOrder) | **POST** orders/{id}/void | Void an order (open → voided) |



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


Get the complete event chain for an order

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

webService.ordersControllerGetOrderEvents(id)
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.math.BigDecimal**|  | |

### Return type

null (empty response body)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: Not defined


Get all refunds for an order

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

webService.ordersControllerGetOrderRefunds(id)
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.math.BigDecimal**|  | |

### Return type

null (empty response body)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: Not defined


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


Mark order as paid (open → paid)

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


Refund items on a paid order

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
val createRefundDto : CreateRefundDto =  // CreateRefundDto | 

val result : RefundResponse = webService.ordersControllerRefundOrder(id, createRefundDto)
```

### Parameters
| **id** | **java.math.BigDecimal**|  | |
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **createRefundDto** | [**CreateRefundDto**](CreateRefundDto.md)|  | |

### Return type

[**RefundResponse**](RefundResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: application/json
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


Reprint receipt or kitchen ticket for an order

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
val reprintOrderDto : ReprintOrderDto =  // ReprintOrderDto | 

val result : PrintResponse = webService.ordersControllerReprintOrder(id, reprintOrderDto)
```

### Parameters
| **id** | **java.math.BigDecimal**|  | |
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **reprintOrderDto** | [**ReprintOrderDto**](ReprintOrderDto.md)|  | |

### Return type

[**PrintResponse**](PrintResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: application/json
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


Verify the hash chain integrity for an order

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

val result : AuditVerifyResponse = webService.ordersControllerVerifyOrderChain(id)
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


Void an order (open → voided)

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

