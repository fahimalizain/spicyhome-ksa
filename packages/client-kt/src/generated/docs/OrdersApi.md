# OrdersApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
| ------------- | ------------- | ------------- |
| [**ordersControllerAddOrderPayment**](OrdersApi.md#ordersControllerAddOrderPayment) | **POST** orders/{id}/payments | Append one payment line to an open order (status stays open) |
| [**ordersControllerCreateOrder**](OrdersApi.md#ordersControllerCreateOrder) | **POST** orders | Create a new order |
| [**ordersControllerGetOrder**](OrdersApi.md#ordersControllerGetOrder) | **GET** orders/{id} | Get order by ID with items and events |
| [**ordersControllerGetOrderEvents**](OrdersApi.md#ordersControllerGetOrderEvents) | **GET** orders/{id}/events | Get the complete event chain for an order |
| [**ordersControllerGetOrderRefunds**](OrdersApi.md#ordersControllerGetOrderRefunds) | **GET** orders/{id}/refunds | Get all refunds for an order |
| [**ordersControllerGetZatcaCreditNoteStatus**](OrdersApi.md#ordersControllerGetZatcaCreditNoteStatus) | **GET** orders/{id}/refunds/{refundId}/zatca-credit-note | Get ZATCA credit note status for a refund (clearance polling) |
| [**ordersControllerGetZatcaInvoiceStatus**](OrdersApi.md#ordersControllerGetZatcaInvoiceStatus) | **GET** orders/{id}/zatca-invoice | Get ZATCA invoice status for an order (clearance polling) |
| [**ordersControllerListOrders**](OrdersApi.md#ordersControllerListOrders) | **GET** orders | List orders with optional filters |
| [**ordersControllerRefundOrder**](OrdersApi.md#ordersControllerRefundOrder) | **POST** orders/{id}/refund | Refund items on a paid order |
| [**ordersControllerReissueZatcaCreditNote**](OrdersApi.md#ordersControllerReissueZatcaCreditNote) | **POST** orders/{id}/refunds/{refundId}/zatca-credit-note/reissue | Reissue a credit note after rejection (new attempt) |
| [**ordersControllerReissueZatcaInvoice**](OrdersApi.md#ordersControllerReissueZatcaInvoice) | **POST** orders/{id}/zatca-invoice/reissue | Reissue a standard invoice after rejection (new attempt) |
| [**ordersControllerReprintOrder**](OrdersApi.md#ordersControllerReprintOrder) | **POST** orders/{id}/print | Reprint receipt or kitchen ticket for an order |
| [**ordersControllerReprintRefundReceipt**](OrdersApi.md#ordersControllerReprintRefundReceipt) | **POST** orders/{id}/refunds/{refundId}/print | Reprint a specific refund receipt |
| [**ordersControllerRetryZatcaClearance**](OrdersApi.md#ordersControllerRetryZatcaClearance) | **POST** orders/{id}/zatca-invoice/retry-clearance | Retry ZATCA clearance for an invoice in error status |
| [**ordersControllerRetryZatcaCreditNoteClearance**](OrdersApi.md#ordersControllerRetryZatcaCreditNoteClearance) | **POST** orders/{id}/refunds/{refundId}/zatca-credit-note/retry-clearance | Retry ZATCA clearance for a credit note in error status |
| [**ordersControllerSendToKitchen**](OrdersApi.md#ordersControllerSendToKitchen) | **POST** orders/{id}/send-to-kitchen | Send unsent item quantities to the kitchen (explicit differential print; 200 no-op when nothing unsent) |
| [**ordersControllerSubmitOrder**](OrdersApi.md#ordersControllerSubmitOrder) | **POST** orders/{id}/submit | Submit an open order: finalize payment (open → paid) with ZATCA invoice + receipt |
| [**ordersControllerSyncItems**](OrdersApi.md#ordersControllerSyncItems) | **PUT** orders/{orderId}/items/sync | Bulk sync cart items (add, update, remove) for an open order |
| [**ordersControllerUpdateOrderItemUnitPrice**](OrdersApi.md#ordersControllerUpdateOrderItemUnitPrice) | **PATCH** orders/{id}/items/{orderItemId}/unit-price | Override one order line unit price on a delivery-partner order (app-menu price, floored at the live catalog price) — ADR 0007 |
| [**ordersControllerUpdateOrderMeta**](OrdersApi.md#ordersControllerUpdateOrderMeta) | **PATCH** orders/{id} | Update open order type and/or table |
| [**ordersControllerUpdateOrderPartner**](OrdersApi.md#ordersControllerUpdateOrderPartner) | **PATCH** orders/{id}/partner | Set, change or clear the delivery partner (+ external ref) on an open order (ADR 0007) |
| [**ordersControllerVerifyOrderChain**](OrdersApi.md#ordersControllerVerifyOrderChain) | **GET** orders/{id}/events/verify | Verify the hash chain integrity for an order |
| [**ordersControllerVoidOrder**](OrdersApi.md#ordersControllerVoidOrder) | **POST** orders/{id}/void | Void an order (open → voided) |



Append one payment line to an open order (status stays open)

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
val addOrderPaymentDto : AddOrderPaymentDto =  // AddOrderPaymentDto | 

val result : OrderResponse = webService.ordersControllerAddOrderPayment(id, addOrderPaymentDto)
```

### Parameters
| **id** | **kotlin.Long**|  | |
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **addOrderPaymentDto** | [**AddOrderPaymentDto**](AddOrderPaymentDto.md)|  | |

### Return type

[**OrderResponse**](OrderResponse.md)

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


Get ZATCA credit note status for a refund (clearance polling)

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
val refundId : kotlin.Long = 789 // kotlin.Long | 

val result : ZatcaInvoiceStatusResponse = webService.ordersControllerGetZatcaCreditNoteStatus(id, refundId)
```

### Parameters
| **id** | **kotlin.Long**|  | |
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **refundId** | **kotlin.Long**|  | |

### Return type

[**ZatcaInvoiceStatusResponse**](ZatcaInvoiceStatusResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


Get ZATCA invoice status for an order (clearance polling)

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

val result : ZatcaInvoiceStatusResponse = webService.ordersControllerGetZatcaInvoiceStatus(id)
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **kotlin.Long**|  | |

### Return type

[**ZatcaInvoiceStatusResponse**](ZatcaInvoiceStatusResponse.md)

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


Reissue a credit note after rejection (new attempt)

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
val refundId : kotlin.Long = 789 // kotlin.Long | 

val result : ZatcaReissueResultDto = webService.ordersControllerReissueZatcaCreditNote(id, refundId)
```

### Parameters
| **id** | **kotlin.Long**|  | |
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **refundId** | **kotlin.Long**|  | |

### Return type

[**ZatcaReissueResultDto**](ZatcaReissueResultDto.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


Reissue a standard invoice after rejection (new attempt)

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
val zatcaInvoiceReissueDto : ZatcaInvoiceReissueDto =  // ZatcaInvoiceReissueDto | 

val result : ZatcaReissueResultDto = webService.ordersControllerReissueZatcaInvoice(id, zatcaInvoiceReissueDto)
```

### Parameters
| **id** | **kotlin.Long**|  | |
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **zatcaInvoiceReissueDto** | [**ZatcaInvoiceReissueDto**](ZatcaInvoiceReissueDto.md)|  | |

### Return type

[**ZatcaReissueResultDto**](ZatcaReissueResultDto.md)

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


Reprint a specific refund receipt

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
val refundId : kotlin.Long = 789 // kotlin.Long | 

val result : PrintResponse = webService.ordersControllerReprintRefundReceipt(id, refundId)
```

### Parameters
| **id** | **kotlin.Long**|  | |
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **refundId** | **kotlin.Long**|  | |

### Return type

[**PrintResponse**](PrintResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


Retry ZATCA clearance for an invoice in error status

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

val result : ZatcaReissueResultDto = webService.ordersControllerRetryZatcaClearance(id)
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **kotlin.Long**|  | |

### Return type

[**ZatcaReissueResultDto**](ZatcaReissueResultDto.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


Retry ZATCA clearance for a credit note in error status

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
val refundId : kotlin.Long = 789 // kotlin.Long | 

val result : ZatcaReissueResultDto = webService.ordersControllerRetryZatcaCreditNoteClearance(id, refundId)
```

### Parameters
| **id** | **kotlin.Long**|  | |
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **refundId** | **kotlin.Long**|  | |

### Return type

[**ZatcaReissueResultDto**](ZatcaReissueResultDto.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


Send unsent item quantities to the kitchen (explicit differential print; 200 no-op when nothing unsent)

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

val result : OrderResponse = webService.ordersControllerSendToKitchen(id)
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


Submit an open order: finalize payment (open → paid) with ZATCA invoice + receipt

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
val submitOrderDto : SubmitOrderDto =  // SubmitOrderDto | 

val result : StatusResponse = webService.ordersControllerSubmitOrder(id, submitOrderDto)
```

### Parameters
| **id** | **kotlin.Long**|  | |
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **submitOrderDto** | [**SubmitOrderDto**](SubmitOrderDto.md)|  | |

### Return type

[**StatusResponse**](StatusResponse.md)

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


Override one order line unit price on a delivery-partner order (app-menu price, floored at the live catalog price) — ADR 0007

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
val orderItemId : kotlin.Long = 789 // kotlin.Long | order_items.id — the LINE id, not the catalog item id
val updateOrderItemUnitPriceDto : UpdateOrderItemUnitPriceDto =  // UpdateOrderItemUnitPriceDto | 

val result : OrderResponse = webService.ordersControllerUpdateOrderItemUnitPrice(id, orderItemId, updateOrderItemUnitPriceDto)
```

### Parameters
| **id** | **kotlin.Long**|  | |
| **orderItemId** | **kotlin.Long**| order_items.id — the LINE id, not the catalog item id | |
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **updateOrderItemUnitPriceDto** | [**UpdateOrderItemUnitPriceDto**](UpdateOrderItemUnitPriceDto.md)|  | |

### Return type

[**OrderResponse**](OrderResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


Update open order type and/or table

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
val updateOrderMetaDto : UpdateOrderMetaDto =  // UpdateOrderMetaDto | 

val result : OrderResponse = webService.ordersControllerUpdateOrderMeta(id, updateOrderMetaDto)
```

### Parameters
| **id** | **kotlin.Long**|  | |
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **updateOrderMetaDto** | [**UpdateOrderMetaDto**](UpdateOrderMetaDto.md)|  | |

### Return type

[**OrderResponse**](OrderResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


Set, change or clear the delivery partner (+ external ref) on an open order (ADR 0007)

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
val updateOrderPartnerDto : UpdateOrderPartnerDto =  // UpdateOrderPartnerDto | 

val result : OrderResponse = webService.ordersControllerUpdateOrderPartner(id, updateOrderPartnerDto)
```

### Parameters
| **id** | **kotlin.Long**|  | |
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **updateOrderPartnerDto** | [**UpdateOrderPartnerDto**](UpdateOrderPartnerDto.md)|  | |

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

