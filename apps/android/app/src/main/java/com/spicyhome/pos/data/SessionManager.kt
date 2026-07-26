package com.spicyhome.pos.data

import io.sentry.Sentry
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch
import java.util.concurrent.atomic.AtomicBoolean

class SessionManager(
    private val preferencesManager: PreferencesManager,
    private val scope: CoroutineScope,
) {
    private val _unauthorized = MutableSharedFlow<Unit>(
        extraBufferCapacity = 1,
        onBufferOverflow = BufferOverflow.DROP_OLDEST,
    )
    val unauthorized: SharedFlow<Unit> = _unauthorized.asSharedFlow()

    private val handling = AtomicBoolean(false)

    fun onUnauthorized() {
        if (!handling.compareAndSet(false, true)) return
        scope.launch {
            try {
                Sentry.setUser(null)
                preferencesManager.clearAuth()
                _unauthorized.emit(Unit)
            } finally {
                handling.set(false)
            }
        }
    }
}
