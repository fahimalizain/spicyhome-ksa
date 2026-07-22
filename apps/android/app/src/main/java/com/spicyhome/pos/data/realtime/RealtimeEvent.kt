package com.spicyhome.pos.data.realtime

data class RealtimeEvent(
    val type: String,
    val payload: String,
    val at: Long,
)
