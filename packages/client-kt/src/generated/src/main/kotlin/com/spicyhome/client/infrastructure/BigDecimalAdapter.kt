package com.spicyhome.client.infrastructure

import com.squareup.moshi.FromJson
import com.squareup.moshi.JsonReader
import com.squareup.moshi.JsonWriter
import com.squareup.moshi.ToJson
import java.math.BigDecimal

class BigDecimalAdapter {
    @ToJson
    fun toJson(writer: JsonWriter, value: BigDecimal?) {
        if (value != null) {
            writer.jsonValue(value.toPlainString())
        } else {
            writer.nullValue()
        }
    }

    @FromJson
    fun fromJson(reader: JsonReader): BigDecimal? {
        return if (reader.peek() == JsonReader.Token.NULL) {
            reader.nextNull()
        } else {
            BigDecimal(reader.nextString())
        }
    }
}
