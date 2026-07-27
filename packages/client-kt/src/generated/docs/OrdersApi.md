# OrdersApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
| ------------- | ------------- | ------------- |
| [**ordersControllerCreateOrder**](OrdersApi.md#ordersControllerCreateOrder) | **POST** orders | Create a new order |
| [**ordersControllerGetOrder**](OrdersApi.md#ordersControllerGetOrder) | **GET** orders/{id} | Get order by ID with items and events |
| [**ordersControllerGetOrderEvents**](OrdersApi.md#ordersControllerGetOrderEvents) | **GET** orders/{id}/events | Get the complete event chain for an order |
| [**ordersControllerGetOrderRefunds**](OrdersApi.md#ordersControllerGetOrderRefunds) | **GET** orders/{id}/refunds | Get all refunds for an order |
| [**ordersControllerListOrders**](OrdersApi.md#ordersControllerListOrders) | **GET** orders | List orders with optional filters |
| [**ordersControllerPayOrder**](OrdersApi.md#ordersControllerPayOrder) | **POST** orders/{id}/pay | Mark order as paid with payment methods (open → paid) |
| [**ordersControllerRefundOrder**](OrdersApi.md#ordersControllerRefundOrder) | **POST** orders/{id}/refund | Refund items on a paid order |
| [**ordersControllerReprintOrder**](OrdersApi.md#ordersControllerReprintOrder) | **POST** orders/{id}/print | Reprint receipt or kitchen ticket for an order |
| [**ordersControllerSyncItems**](OrdersApi.md#ordersControllerSyncItems) | **PUT** orders/{orderId}/items/sync | Bulk sync cart items (add, update, remove) for an open order |
| [**ordersControllerVerifyOrderChain**](OrdersApi.md#ordersControllerVerifyOrderChain) | **GET** orders/{id}/events/verify | Verify the hash chain integrity for an order |
| [**ordersControllerVoidOrder**](OrdersApi.md#ordersControllerVoidOrder) | **POST** orders/{id}/void | Void an order (open → voided) |



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


Get order by ID with items and events

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(OrdersApi::class.java)
val id : kotlin.Long = 789 // kotlin.Long | 

val result : OrderResponse = webService.ordersControllerGetOrder(id)
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **kotlin.Long**|  | |

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
val id : kotlin.Long = 789 // kotlin.Long | 

val result : kotlin.collections.List<OrderEventResponse> = webService.ordersControllerGetOrderEvents(id)
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **kotlin.Long**|  | |

### Return type

[**kotlin.collections.List&lt;OrderEventResponse&gt;**](OrderEventResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


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
val id : kotlin.Long = 789 // kotlin.Long | 

val result : kotlin.collections.List<OrderRefundResponse> = webService.ordersControllerGetOrderRefunds(id)
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **kotlin.Long**|  | |

### Return type

[**kotlin.collections.List&lt;OrderRefundResponse&gt;**](OrderRefundResponse.md)

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

val result : kotlin.collections.List<OrderSummaryResponse> = webService.ordersControllerListOrders(status, date)
```

### Parameters
| **status** | **kotlin.String**|  | |
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **date** | **kotlin.String**|  | |

### Return type

[**kotlin.collections.List&lt;OrderSummaryResponse&gt;**](OrderSummaryResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


Mark order as paid with payment methods (open → paid)

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(OrdersApi::class.java)
val id : kotlin.Long = 789 // kotlin.Long | 
val payOrderDto : PayOrderDto =  // PayOrderDto | 

val result : StatusResponse = webService.ordersControllerPayOrder(id, payOrderDto)
```

### Parameters
| **id** | **kotlin.Long**|  | |
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **payOrderDto** | [**PayOrderDto**](PayOrderDto.md)|  | |

### Return type

[**StatusResponse**](StatusResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: application/json
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
val id : kotlin.Long = 789 // kotlin.Long | 
val createRefundDto : CreateRefundDto =  // CreateRefundDto | 

val result : RefundResponse = webService.ordersControllerRefundOrder(id, createRefundDto)
```

### Parameters
| **id** | **kotlin.Long**|  | |
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
val id : kotlin.Long = 789 // kotlin.Long | 
val reprintOrderDto : ReprintOrderDto =  // ReprintOrderDto | 

val result : PrintResponse = webService.ordersControllerReprintOrder(id, reprintOrderDto)
```

### Parameters
| **id** | **kotlin.Long**|  | |
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


Bulk sync cart items (add, update, remove) for an open order

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(OrdersApi::class.java)
val orderId : kotlin.Long = 789 // kotlin.Long | 
val syncOrderItemsDto : SyncOrderItemsDto =  // SyncOrderItemsDto | 

val result : OrderResponse = webService.ordersControllerSyncItems(orderId, syncOrderItemsDto)
```

### Parameters
| **orderId** | **kotlin.Long**|  | |
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **syncOrderItemsDto** | [**SyncOrderItemsDto**](SyncOrderItemsDto.md)|  | |

### Return type

[**OrderResponse**](OrderResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: application/json
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
val id : kotlin.Long = 789 // kotlin.Long | 

val result : AuditVerifyResponse = webService.ordersControllerVerifyOrderChain(id)
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **kotlin.Long**|  | |

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
val id : kotlin.Long = 789 // kotlin.Long | 

val result : StatusResponse = webService.ordersControllerVoidOrder(id)
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **kotlin.Long**|  | |

### Return type

[**StatusResponse**](StatusResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

