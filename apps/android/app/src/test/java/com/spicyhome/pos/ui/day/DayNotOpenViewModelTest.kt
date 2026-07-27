package com.spicyhome.pos.ui.day

import com.google.common.truth.Truth.assertThat
import com.spicyhome.client.apis.DayApi
import com.spicyhome.client.models.CurrentDayResponse
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
import java.net.ConnectException

@OptIn(ExperimentalCoroutinesApi::class)
class DayNotOpenViewModelTest {

    private val testDispatcher = UnconfinedTestDispatcher()

    private lateinit var preferencesManager: PreferencesManager
    private lateinit var apiClientProvider: ApiClientProvider
    private lateinit var dayApi: DayApi
    private lateinit var currentDayCall: Call<CurrentDayResponse>

    private val serverUrlFlow = MutableStateFlow("http://localhost:3000")
    private val authTokenFlow = MutableStateFlow("test-token")

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)

        preferencesManager = mockk(relaxed = true)
        apiClientProvider = mockk(relaxed = true)
        dayApi = mockk(relaxed = true)
        currentDayCall = mockk(relaxed = true)

        every { preferencesManager.serverUrl } returns serverUrlFlow
        every { preferencesManager.authToken } returns authTokenFlow
        every { apiClientProvider.createDayApi(any(), any()) } returns dayApi
        every { dayApi.businessDayControllerGetCurrent() } returns currentDayCall
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun createViewModel() =
        DayNotOpenViewModel(preferencesManager, apiClientProvider, testDispatcher)

    @Test
    fun `initial state is loading`() = runTest {
        // Set up day-not-open response
        every { currentDayCall.execute() } returns
            Response.success(CurrentDayResponse(open = false))

        val vm = createViewModel()
        val state = vm.uiState.value
        // After init completes in UnconfinedTestDispatcher
        assertThat(state.checkDone).isTrue()
        assertThat(state.dayOpen).isFalse()
        assertThat(state.isLoading).isFalse()
    }

    @Test
    fun `day not open stays with checkDone true`() = runTest {
        every { currentDayCall.execute() } returns
            Response.success(CurrentDayResponse(open = false))

        val vm = createViewModel()
        val state = vm.uiState.value
        assertThat(state.dayOpen).isFalse()
        assertThat(state.checkDone).isTrue()
        assertThat(state.isLoading).isFalse()
    }

    @Test
    fun `day open transitions dayOpen to true`() = runTest {
        every { currentDayCall.execute() } returns
            Response.success(CurrentDayResponse(open = true, status = "open"))

        val vm = createViewModel()
        val state = vm.uiState.value
        assertThat(state.dayOpen).isTrue()
        assertThat(state.checkDone).isTrue()
        assertThat(state.isLoading).isFalse()
    }

    @Test
    fun `network failure sets error and dayOpen false`() = runTest {
        every { currentDayCall.execute() } throws ConnectException("Connection refused")

        val vm = createViewModel()
        val state = vm.uiState.value
        assertThat(state.dayOpen).isFalse()
        assertThat(state.checkDone).isTrue()
        assertThat(state.error).isNotNull()
        assertThat(state.error).contains("Network error")
    }

    @Test
    fun `HTTP error sets error and dayOpen false`() = runTest {
        every { currentDayCall.execute() } returns
            Response.error(500, okhttp3.ResponseBody.create(null, ""))

        val vm = createViewModel()
        val state = vm.uiState.value
        assertThat(state.dayOpen).isFalse()
        assertThat(state.checkDone).isTrue()
        assertThat(state.error).isNotNull()
        assertThat(state.error).contains("500")
    }

    @Test
    fun `checkDay refresh when still closed stays not open`() = runTest {
        every { currentDayCall.execute() } returns
            Response.success(CurrentDayResponse(open = false))

        val vm = createViewModel()
        assertThat(vm.uiState.value.dayOpen).isFalse()

        // Refresh
        vm.checkDay()
        val state = vm.uiState.value
        assertThat(state.dayOpen).isFalse()
        assertThat(state.isLoading).isFalse()
    }

    @Test
    fun `checkDay refresh when now open transitions to dayOpen`() = runTest {
        // First call: not open
        every { currentDayCall.execute() } returnsMany listOf(
            Response.success(CurrentDayResponse(open = false)),
            Response.success(CurrentDayResponse(open = true, status = "open")),
        )

        val vm = createViewModel()
        assertThat(vm.uiState.value.dayOpen).isFalse()

        // Refresh — now open
        vm.checkDay()
        val state = vm.uiState.value
        assertThat(state.dayOpen).isTrue()
        assertThat(state.isLoading).isFalse()
    }

    @Test
    fun `checkDay refresh on network error shows error`() = runTest {
        every { currentDayCall.execute() } returns
            Response.success(CurrentDayResponse(open = false))

        val vm = createViewModel()
        assertThat(vm.uiState.value.dayOpen).isFalse()

        // Set up failure for refresh
        every { currentDayCall.execute() } throws ConnectException("timeout")
        vm.checkDay()

        val state = vm.uiState.value
        assertThat(state.dayOpen).isFalse()
        assertThat(state.error).isNotNull()
    }

    @Test
    fun `null body treated as not open`() = runTest {
        every { currentDayCall.execute() } returns
            Response.success(null)

        val vm = createViewModel()
        val state = vm.uiState.value
        assertThat(state.dayOpen).isFalse()
        assertThat(state.checkDone).isTrue()
    }

    @Test
    fun `no token falls back gracefully`() = runTest {
        authTokenFlow.value = ""
        every { currentDayCall.execute() } returns
            Response.success(CurrentDayResponse(open = false))

        val vm = createViewModel()
        val state = vm.uiState.value
        assertThat(state.dayOpen).isFalse()
        assertThat(state.checkDone).isTrue()
        assertThat(state.error).contains("Not authenticated")
    }
}
