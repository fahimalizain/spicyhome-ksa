package com.spicyhome.client.infrastructure

import com.squareup.moshi.FromJson
import com.squareup.moshi.JsonDataException
import com.squareup.moshi.JsonReader
import com.squareup.moshi.JsonWriter
import com.squareup.moshi.ToJson
import java.math.BigDecimal

/**
 * Moshi adapter for [BigDecimal] that writes JSON numbers (not strings).
 *
 * The openapi-generator default emits `@ToJson fun toJson(value: BigDecimal): String`,
 * which causes Moshi to write JSON strings like `"4"` instead of numbers like `4`.
 * This adapter uses [JsonWriter.value] to write a JSON number directly, and
 * accepts both JSON numbers and strings on read for compatibility.
 */
class BigDecimalAdapter {
    @ToJson
    fun toJson(writer: JsonWriter, value: BigDecimal?) {
        if (value == null) {
            writer.nullValue()
        } else {
            writer.value(value)
        }
    }

    @FromJson
    fun fromJson(reader: JsonReader): BigDecimal? {
        return when (reader.peek()) {
            JsonReader.Token.NULL -> {
                reader.nextNull<Unit>()
                null
            }
            JsonReader.Token.NUMBER, JsonReader.Token.STRING -> {
                BigDecimal(reader.nextString())
            }
            else -> throw JsonDataException(
                "Expected number or string for BigDecimal but was " +
                    reader.peek() + " at path " + reader.path,
            )
        }
    }
}
