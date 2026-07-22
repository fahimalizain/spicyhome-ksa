package com.spicyhome.pos.ui.login

import com.google.common.truth.Truth.assertThat
import com.spicyhome.pos.data.PreferencesManager
import com.spicyhome.pos.data.api.ApiClientProvider
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class LoginViewModelTest {

    private val testDispatcher = StandardTestDispatcher()

    private lateinit var preferencesManager: PreferencesManager
    private lateinit var apiClientProvider: ApiClientProvider

    private val serverUrlFlow = MutableStateFlow("http://localhost:3000")

    private lateinit var viewModel: LoginViewModel

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)

        preferencesManager = mockk(relaxed = true)
        apiClientProvider = mockk(relaxed = true)

        every { preferencesManager.serverUrl } returns serverUrlFlow
        every { preferencesManager.authToken } returns MutableStateFlow(null)
        coEvery { preferencesManager.setAuthToken(any()) } returns Unit
        coEvery { preferencesManager.setUsername(any()) } returns Unit
        coEvery { preferencesManager.clearAuth() } returns Unit
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `initial state has empty fields`() = runTest(testDispatcher) {
        viewModel = LoginViewModel(preferencesManager, apiClientProvider)
        testDispatcher.scheduler.advanceUntilIdle()

        val state = viewModel.uiState.value
        assertThat(state.username).isEmpty()
        assertThat(state.pin).isEmpty()
        assertThat(state.isLoading).isFalse()
        assertThat(state.error).isNull()
        assertThat(state.isLoggedIn).isFalse()
    }

    @Test
    fun `initial state loads saved server URL`() = runTest(testDispatcher) {
        viewModel = LoginViewModel(preferencesManager, apiClientProvider)
        testDispatcher.scheduler.advanceUntilIdle()

        val state = viewModel.uiState.value
        assertThat(state.savedServerUrl).isEqualTo("http://localhost:3000")
    }

    @Test
    fun `onUsernameChange updates username`() = runTest(testDispatcher) {
        viewModel = LoginViewModel(preferencesManager, apiClientProvider)
        testDispatcher.scheduler.advanceUntilIdle()

        viewModel.onUsernameChange("admin")

        assertThat(viewModel.uiState.value.username).isEqualTo("admin")
    }

    @Test
    fun `onPinChange accepts numeric input up to 6 digits`() = runTest(testDispatcher) {
        viewModel = LoginViewModel(preferencesManager, apiClientProvider)
        testDispatcher.scheduler.advanceUntilIdle()

        viewModel.onPinChange("1234")

        assertThat(viewModel.uiState.value.pin).isEqualTo("1234")
    }

    @Test
    fun `onPinChange rejects non-numeric input`() = runTest(testDispatcher) {
        viewModel = LoginViewModel(preferencesManager, apiClientProvider)
        testDispatcher.scheduler.advanceUntilIdle()

        viewModel.onPinChange("abc")

        assertThat(viewModel.uiState.value.pin).isEmpty()
    }

    @Test
    fun `onPinChange caps at 6 digits`() = runTest(testDispatcher) {
        viewModel = LoginViewModel(preferencesManager, apiClientProvider)
        testDispatcher.scheduler.advanceUntilIdle()

        viewModel.onPinChange("1234567")

        assertThat(viewModel.uiState.value.pin).isEmpty()
    }

    @Test
    fun `login without username shows error`() = runTest(testDispatcher) {
        viewModel = LoginViewModel(preferencesManager, apiClientProvider)
        testDispatcher.scheduler.advanceUntilIdle()

        viewModel.login()

        assertThat(viewModel.uiState.value.error).isNotNull()
        assertThat(viewModel.uiState.value.isLoggedIn).isFalse()
    }

    @Test
    fun `login without pin shows error`() = runTest(testDispatcher) {
        viewModel = LoginViewModel(preferencesManager, apiClientProvider)
        testDispatcher.scheduler.advanceUntilIdle()
        viewModel.onUsernameChange("admin")

        viewModel.login()

        assertThat(viewModel.uiState.value.error).isNotNull()
    }

    @Test
    fun `clearError clears the error message`() = runTest(testDispatcher) {
        viewModel = LoginViewModel(preferencesManager, apiClientProvider)
        testDispatcher.scheduler.advanceUntilIdle()

        viewModel.login() // triggers error
        viewModel.clearError()

        assertThat(viewModel.uiState.value.error).isNull()
    }

    @Test
    fun `logout clears auth and resets state`() = runTest(testDispatcher) {
        viewModel = LoginViewModel(preferencesManager, apiClientProvider)
        testDispatcher.scheduler.advanceUntilIdle()

        viewModel.onUsernameChange("admin")
        viewModel.onPinChange("1234")
        viewModel.logout()
        testDispatcher.scheduler.advanceUntilIdle()

        val state = viewModel.uiState.value
        assertThat(state.username).isEmpty()
        assertThat(state.pin).isEmpty()
        assertThat(state.isLoggedIn).isFalse()
    }
}
