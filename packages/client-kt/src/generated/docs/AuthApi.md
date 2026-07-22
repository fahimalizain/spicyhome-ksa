# AuthApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
| ------------- | ------------- | ------------- |
| [**authControllerCreateRole**](AuthApi.md#authControllerCreateRole) | **POST** auth/roles | Create a new role |
| [**authControllerCreateUser**](AuthApi.md#authControllerCreateUser) | **POST** auth/users | Create a new user |
| [**authControllerGetUser**](AuthApi.md#authControllerGetUser) | **GET** auth/users/{id} | Get user by ID |
| [**authControllerListRoles**](AuthApi.md#authControllerListRoles) | **GET** auth/roles | List all roles |
| [**authControllerListUsers**](AuthApi.md#authControllerListUsers) | **GET** auth/users | List all users |
| [**authControllerLogin**](AuthApi.md#authControllerLogin) | **POST** auth/login | Login with username and PIN |
| [**authControllerUpdateRole**](AuthApi.md#authControllerUpdateRole) | **PUT** auth/roles/{id} | Update a role |
| [**authControllerUpdateUser**](AuthApi.md#authControllerUpdateUser) | **PUT** auth/users/{id} | Update a user |



Create a new role

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(AuthApi::class.java)
val createRoleDto : CreateRoleDto =  // CreateRoleDto | 

val result : RoleResponse = webService.authControllerCreateRole(createRoleDto)
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **createRoleDto** | [**CreateRoleDto**](CreateRoleDto.md)|  | |

### Return type

[**RoleResponse**](RoleResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


Create a new user

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(AuthApi::class.java)
val createUserDto : CreateUserDto =  // CreateUserDto | 

val result : UserResponse = webService.authControllerCreateUser(createUserDto)
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **createUserDto** | [**CreateUserDto**](CreateUserDto.md)|  | |

### Return type

[**UserResponse**](UserResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


Get user by ID

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(AuthApi::class.java)
val id : java.math.BigDecimal = 8.14 // java.math.BigDecimal | 

val result : UserResponse = webService.authControllerGetUser(id)
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.math.BigDecimal**|  | |

### Return type

[**UserResponse**](UserResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


List all roles

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(AuthApi::class.java)

val result : kotlin.collections.List<RoleResponse> = webService.authControllerListRoles()
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**kotlin.collections.List&lt;RoleResponse&gt;**](RoleResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


List all users

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(AuthApi::class.java)

val result : kotlin.collections.List<UserResponse> = webService.authControllerListUsers()
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**kotlin.collections.List&lt;UserResponse&gt;**](UserResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


Login with username and PIN

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
val webService = apiClient.createWebservice(AuthApi::class.java)
val loginDto : LoginDto =  // LoginDto | 

val result : LoginResponse = webService.authControllerLogin(loginDto)
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **loginDto** | [**LoginDto**](LoginDto.md)|  | |

### Return type

[**LoginResponse**](LoginResponse.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


Update a role

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(AuthApi::class.java)
val id : java.math.BigDecimal = 8.14 // java.math.BigDecimal | 
val updateRoleDto : UpdateRoleDto =  // UpdateRoleDto | 

val result : RoleResponse = webService.authControllerUpdateRole(id, updateRoleDto)
```

### Parameters
| **id** | **java.math.BigDecimal**|  | |
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **updateRoleDto** | [**UpdateRoleDto**](UpdateRoleDto.md)|  | |

### Return type

[**RoleResponse**](RoleResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


Update a user

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(AuthApi::class.java)
val id : java.math.BigDecimal = 8.14 // java.math.BigDecimal | 
val updateUserDto : UpdateUserDto =  // UpdateUserDto | 

val result : UserResponse = webService.authControllerUpdateUser(id, updateUserDto)
```

### Parameters
| **id** | **java.math.BigDecimal**|  | |
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **updateUserDto** | [**UpdateUserDto**](UpdateUserDto.md)|  | |

### Return type

[**UserResponse**](UserResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

