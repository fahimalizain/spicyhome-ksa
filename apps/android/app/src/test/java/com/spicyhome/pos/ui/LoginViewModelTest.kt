package com.spicyhome.pos.ui.login

import com.google.common.truth.Truth.assertThat
import com.spicyhome.client.apis.AuthApi
import com.spicyhome.client.models.UsernamesResponse
import com.spicyhome.pos.data.PreferencesManager
import com.spicyhome.pos.data.api.ApiClientProvider
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import org.junit.Test
import retrofit2.Call
import retrofit2.Response

@OptIn(ExperimentalCoroutinesApi::class)
class LoginViewModelTest {

    private val testDispatcher = UnconfinedTestDispatcher()

    private lateinit var preferencesManager: PreferencesManager
    private lateinit var apiClientProvider: ApiClientProvider
    private lateinit var authApi: AuthApi
    private lateinit var usernamesCall: Call<UsernamesResponse>

    private val serverUrlFlow = MutableStateFlow("http://localhost:3000")

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)

        preferencesManager = mockk(relaxed = true)
        apiClientProvider = mockk(relaxed = true)
        authApi = mockk(relaxed = true)
        usernamesCall = mockk(relaxed = true)

        every { preferencesManager.serverUrl } returns serverUrlFlow
        every { preferencesManager.authToken } returns MutableStateFlow(null)
        every { apiClientProvider.createAuthApi(any()) } returns authApi
        every { authApi.authControllerListUsernames() } returns usernamesCall
        every { usernamesCall.execute() } returns
            Response.success(UsernamesResponse(usernames = listOf("admin", "cashier1")))
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun createViewModel() =
        LoginViewModel(preferencesManager, apiClientProvider, testDispatcher)

    @Test
    fun `initial state has empty fields`() = runTest {
        val vm = createViewModel()
        val state = vm.uiState.value
        assertThat(state.username).isEmpty()
        assertThat(state.pin).isEmpty()
        assertThat(state.isLoading).isFalse()
        assertThat(state.error).isNull()
        assertThat(state.isLoggedIn).isFalse()
    }

    @Test
    fun `initial state loads saved server URL`() = runTest {
        val vm = createViewModel()
        assertThat(vm.uiState.value.savedServerUrl).isEqualTo("http://localhost:3000")
    }

    @Test
    fun `loads usernames into select mode on init`() = runTest {
        val vm = createViewModel()
        val state = vm.uiState.value
        assertThat(state.usernameMode).isEqualTo(UsernameMode.SELECT)
        assertThat(state.usernames).containsExactly("admin", "cashier1")
    }

    @Test
    fun `falls back to input mode when usernames fetch fails`() = runTest {
        every { usernamesCall.execute() } throws java.net.ConnectException("refused")

        val vm = createViewModel()
        assertThat(vm.uiState.value.usernameMode).isEqualTo(UsernameMode.INPUT)
        assertThat(vm.uiState.value.usernames).isEmpty()
    }

    @Test
    fun `falls back to input mode when usernames list is empty`() = runTest {
        every { usernamesCall.execute() } returns
            Response.success(UsernamesResponse(usernames = emptyList()))

        val vm = createViewModel()
        assertThat(vm.uiState.value.usernameMode).isEqualTo(UsernameMode.INPUT)
    }

    @Test
    fun `falls back to input mode when server URL is blank`() = runTest {
        serverUrlFlow.value = ""

        val vm = createViewModel()
        assertThat(vm.uiState.value.usernameMode).isEqualTo(UsernameMode.INPUT)
    }

    @Test
    fun `onUsernameChange updates username`() = runTest {
        val vm = createViewModel()
        vm.onUsernameChange("admin")
        assertThat(vm.uiState.value.username).isEqualTo("admin")
    }

    @Test
    fun `onPinChange accepts numeric input up to 6 digits`() = runTest {
        val vm = createViewModel()
        vm.onPinChange("1234")
        assertThat(vm.uiState.value.pin).isEqualTo("1234")
    }

    @Test
    fun `onPinChange rejects non-numeric input`() = runTest {
        val vm = createViewModel()
        vm.onPinChange("abc")
        assertThat(vm.uiState.value.pin).isEmpty()
    }

    @Test
    fun `onPinChange caps at 6 digits`() = runTest {
        val vm = createViewModel()
        vm.onPinChange("1234567")
        assertThat(vm.uiState.value.pin).isEmpty()
    }

    @Test
    fun `login without username shows error`() = runTest {
        val vm = createViewModel()
        vm.login()
        assertThat(vm.uiState.value.error).isNotNull()
        assertThat(vm.uiState.value.isLoggedIn).isFalse()
    }

    @Test
    fun `login without pin shows error`() = runTest {
        val vm = createViewModel()
        vm.onUsernameChange("admin")
        vm.login()
        assertThat(vm.uiState.value.error).isNotNull()
    }

    @Test
    fun `clearError clears the error message`() = runTest {
        val vm = createViewModel()
        vm.login()
        vm.clearError()
        assertThat(vm.uiState.value.error).isNull()
    }

    @Test
    fun `logout clears auth and resets state`() = runTest {
        val vm = createViewModel()
        vm.onUsernameChange("admin")
        vm.onPinChange("1234")
        vm.logout()
        val state = vm.uiState.value
        assertThat(state.username).isEmpty()
        assertThat(state.pin).isEmpty()
        assertThat(state.isLoggedIn).isFalse()
    }
}
