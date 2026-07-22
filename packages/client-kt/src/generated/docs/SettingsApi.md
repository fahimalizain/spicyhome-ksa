# SettingsApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
| ------------- | ------------- | ------------- |
| [**settingsControllerGetAll**](SettingsApi.md#settingsControllerGetAll) | **GET** settings | Get all settings |
| [**settingsControllerSet**](SettingsApi.md#settingsControllerSet) | **PUT** settings | Set a setting value |



Get all settings

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(SettingsApi::class.java)

val result : kotlin.collections.List<SettingResponse> = webService.settingsControllerGetAll()
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**kotlin.collections.List&lt;SettingResponse&gt;**](SettingResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


Set a setting value

### Example
```kotlin
// Import classes:
//import com.spicyhome.client.*
//import com.spicyhome.client.infrastructure.*
//import com.spicyhome.client.models.*

val apiClient = ApiClient()
apiClient.setBearerToken("TOKEN")
val webService = apiClient.createWebservice(SettingsApi::class.java)
val setSettingDto : SetSettingDto =  // SetSettingDto | 

val result : SettingResponse = webService.settingsControllerSet(setSettingDto)
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **setSettingDto** | [**SetSettingDto**](SetSettingDto.md)|  | |

### Return type

[**SettingResponse**](SettingResponse.md)

### Authorization


Configure bearer:
    ApiClient().setBearerToken("TOKEN")

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

