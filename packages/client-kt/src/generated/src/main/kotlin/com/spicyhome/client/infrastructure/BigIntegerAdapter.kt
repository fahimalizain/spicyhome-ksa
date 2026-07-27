package com.spicyhome.client.infrastructure

import com.squareup.moshi.FromJson
import com.squareup.moshi.JsonDataException
import com.squareup.moshi.JsonReader
import com.squareup.moshi.JsonWriter
import com.squareup.moshi.ToJson
import java.math.BigInteger

/**
 * Moshi adapter for [BigInteger] that writes JSON numbers (not strings).
 *
 * Mirrors the [BigDecimalAdapter] fix — the openapi-generator default
 * returns `String` from [ToJson], causing Moshi to emit JSON strings.
 * This adapter writes JSON numbers via [JsonWriter.value] and accepts
 * both numbers and strings on read.
 */
class BigIntegerAdapter {
    @ToJson
    fun toJson(writer: JsonWriter, value: BigInteger?) {
        if (value == null) {
            writer.nullValue()
        } else {
            writer.value(value)
        }
    }

    @FromJson
    fun fromJson(reader: JsonReader): BigInteger? {
        return when (reader.peek()) {
            JsonReader.Token.NULL -> {
                reader.nextNull<Unit>()
                null
            }
            JsonReader.Token.NUMBER, JsonReader.Token.STRING -> {
                BigInteger(reader.nextString())
            }
            else -> throw JsonDataException(
                "Expected number or string for BigInteger but was " +
                    reader.peek() + " at path " + reader.path,
            )
        }
    }
}
