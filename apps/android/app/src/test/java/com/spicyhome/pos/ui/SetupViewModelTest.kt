package com.spicyhome.pos.ui.setup

import com.google.common.truth.Truth.assertThat
import com.spicyhome.pos.data.PreferencesManager
import com.spicyhome.pos.data.api.ApiClientProvider
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
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
class SetupViewModelTest {

    private val testDispatcher = UnconfinedTestDispatcher()

    private lateinit var preferencesManager: PreferencesManager
    private lateinit var apiClientProvider: ApiClientProvider

    private val serverUrlFlow = MutableStateFlow<String?>(null)

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)

        preferencesManager = mockk(relaxed = true)
        apiClientProvider = mockk(relaxed = true)

        every { preferencesManager.serverUrl } returns serverUrlFlow
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun createViewModel(skipAutoConnect: Boolean = false) =
        SetupViewModel(preferencesManager, apiClientProvider, skipAutoConnect, testDispatcher)

    @Test
    fun `cold start with saved URL auto-connects when reachable`() = runTest {
        serverUrlFlow.value = "http://192.168.1.50:3000"
        every { apiClientProvider.testConnectivity(any()) } returns true

        val vm = createViewModel()

        val state = vm.uiState.value
        assertThat(state.serverUrl).isEqualTo("http://192.168.1.50:3000")
        assertThat(state.isConnected).isTrue()
        assertThat(state.isAutoConnecting).isFalse()
    }

    @Test
    fun `cold start with saved URL unreachable keeps disconnected with error`() = runTest {
        serverUrlFlow.value = "http://192.168.1.50:3000"
        every { apiClientProvider.testConnectivity(any()) } returns false

        val vm = createViewModel()

        val state = vm.uiState.value
        assertThat(state.isConnected).isFalse()
        assertThat(state.testResult).isNotNull()
        assertThat(state.isAutoConnecting).isFalse()
    }

    @Test
    fun `change server path prefills saved URL without auto-connect`() = runTest {
        serverUrlFlow.value = "http://192.168.1.50:3000"

        val vm = createViewModel(skipAutoConnect = true)

        val state = vm.uiState.value
        assertThat(state.serverUrl).isEqualTo("http://192.168.1.50:3000")
        assertThat(state.isConnected).isFalse()
        assertThat(state.isAutoConnecting).isFalse()
        assertThat(state.isTesting).isFalse()
        verify(exactly = 0) { apiClientProvider.testConnectivity(any()) }
    }

    @Test
    fun `no saved URL keeps placeholder and does not auto-connect`() = runTest {
        serverUrlFlow.value = null

        val vm = createViewModel()

        val state = vm.uiState.value
        assertThat(state.serverUrl).isEqualTo("http://192.168.1.50:3000")
        assertThat(state.isConnected).isFalse()
        assertThat(state.isAutoConnecting).isFalse()
        assertThat(state.isTesting).isFalse()
        verify(exactly = 0) { apiClientProvider.testConnectivity(any()) }
    }

    @Test
    fun `manual testConnection success saves URL and connects`() = runTest {
        serverUrlFlow.value = null
        every { apiClientProvider.testConnectivity(any()) } returns true

        val vm = createViewModel()
        vm.onServerUrlChange("http://192.168.1.50:4000")
        vm.testConnection()

        val state = vm.uiState.value
        assertThat(state.isConnected).isTrue()
        assertThat(state.isAutoConnecting).isFalse()
        coVerify { preferencesManager.setServerUrl("http://192.168.1.50:4000") }
    }

    @Test
    fun `manual testConnection failure stays disconnected with error`() = runTest {
        serverUrlFlow.value = null
        every { apiClientProvider.testConnectivity(any()) } returns false

        val vm = createViewModel()
        vm.onServerUrlChange("http://192.168.1.50:4000")
        vm.testConnection()

        val state = vm.uiState.value
        assertThat(state.isConnected).isFalse()
        assertThat(state.testResult).isNotNull()
    }
}
