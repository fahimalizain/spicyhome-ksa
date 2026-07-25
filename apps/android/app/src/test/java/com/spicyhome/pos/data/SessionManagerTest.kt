package com.spicyhome.pos.data

import com.google.common.truth.Truth.assertThat
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SessionManagerTest {

    private lateinit var preferencesManager: PreferencesManager

    @Before
    fun setUp() {
        preferencesManager = mockk(relaxed = true)
    }

    @Test
    fun `onUnauthorized clears auth token`() = runTest {
        val sessionManager = SessionManager(preferencesManager, this)

        sessionManager.onUnauthorized()
        advanceUntilIdle()

        coVerify { preferencesManager.clearAuth() }
    }

    @Test
    fun `onUnauthorized emits unauthorized event`() = runTest {
        val sessionManager = SessionManager(preferencesManager, this)

        var received = false
        val job = launch { sessionManager.unauthorized.collect { received = true } }

        sessionManager.onUnauthorized()
        advanceUntilIdle()

        assertThat(received).isTrue()

        job.cancel()
    }

    @Test
    fun `concurrent calls do not double-fire`() = runTest {
        val sessionManager = SessionManager(preferencesManager, this)

        var callCount = 0
        val job = launch { sessionManager.unauthorized.collect { callCount++ } }

        sessionManager.onUnauthorized()
        sessionManager.onUnauthorized()
        sessionManager.onUnauthorized()
        advanceUntilIdle()

        assertThat(callCount).isEqualTo(1)

        job.cancel()
    }
}
