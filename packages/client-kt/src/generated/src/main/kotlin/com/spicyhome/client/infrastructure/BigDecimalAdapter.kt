package com.spicyhome.client.infrastructure

import com.squareup.moshi.FromJson
import com.squareup.moshi.JsonDataException
import com.squareup.moshi.JsonReader
import com.squareup.moshi.JsonWriter
import com.squareup.moshi.ToJson
import java.math.BigDecimal

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
