package com.spicyhome.pos.ui.login

import com.google.common.truth.Truth.assertThat
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

@OptIn(ExperimentalCoroutinesApi::class)
class LoginViewModelTest {

    private val testDispatcher = UnconfinedTestDispatcher()

    private lateinit var preferencesManager: PreferencesManager
    private lateinit var apiClientProvider: ApiClientProvider

    private val serverUrlFlow = MutableStateFlow("http://localhost:3000")

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)

        preferencesManager = mockk(relaxed = true)
        apiClientProvider = mockk(relaxed = true)

        every { preferencesManager.serverUrl } returns serverUrlFlow
        every { preferencesManager.authToken } returns MutableStateFlow(null)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `initial state has empty fields`() = runTest {
        val vm = LoginViewModel(preferencesManager, apiClientProvider)
        val state = vm.uiState.value
        assertThat(state.username).isEmpty()
        assertThat(state.pin).isEmpty()
        assertThat(state.isLoading).isFalse()
        assertThat(state.error).isNull()
        assertThat(state.isLoggedIn).isFalse()
    }

    @Test
    fun `initial state loads saved server URL`() = runTest {
        val vm = LoginViewModel(preferencesManager, apiClientProvider)
        assertThat(vm.uiState.value.savedServerUrl).isEqualTo("http://localhost:3000")
    }

    @Test
    fun `onUsernameChange updates username`() = runTest {
        val vm = LoginViewModel(preferencesManager, apiClientProvider)
        vm.onUsernameChange("admin")
        assertThat(vm.uiState.value.username).isEqualTo("admin")
    }

    @Test
    fun `onPinChange accepts numeric input up to 6 digits`() = runTest {
        val vm = LoginViewModel(preferencesManager, apiClientProvider)
        vm.onPinChange("1234")
        assertThat(vm.uiState.value.pin).isEqualTo("1234")
    }

    @Test
    fun `onPinChange rejects non-numeric input`() = runTest {
        val vm = LoginViewModel(preferencesManager, apiClientProvider)
        vm.onPinChange("abc")
        assertThat(vm.uiState.value.pin).isEmpty()
    }

    @Test
    fun `onPinChange caps at 6 digits`() = runTest {
        val vm = LoginViewModel(preferencesManager, apiClientProvider)
        vm.onPinChange("1234567")
        assertThat(vm.uiState.value.pin).isEmpty()
    }

    @Test
    fun `login without username shows error`() = runTest {
        val vm = LoginViewModel(preferencesManager, apiClientProvider)
        vm.login()
        assertThat(vm.uiState.value.error).isNotNull()
        assertThat(vm.uiState.value.isLoggedIn).isFalse()
    }

    @Test
    fun `login without pin shows error`() = runTest {
        val vm = LoginViewModel(preferencesManager, apiClientProvider)
        vm.onUsernameChange("admin")
        vm.login()
        assertThat(vm.uiState.value.error).isNotNull()
    }

    @Test
    fun `clearError clears the error message`() = runTest {
        val vm = LoginViewModel(preferencesManager, apiClientProvider)
        vm.login()
        vm.clearError()
        assertThat(vm.uiState.value.error).isNull()
    }

    @Test
    fun `logout clears auth and resets state`() = runTest {
        val vm = LoginViewModel(preferencesManager, apiClientProvider)
        vm.onUsernameChange("admin")
        vm.onPinChange("1234")
        vm.logout()
        val state = vm.uiState.value
        assertThat(state.username).isEmpty()
        assertThat(state.pin).isEmpty()
        assertThat(state.isLoggedIn).isFalse()
    }
}
