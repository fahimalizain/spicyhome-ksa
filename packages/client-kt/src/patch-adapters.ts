/**
 * Post-generate patch: overwrites openapi-generator's BigDecimalAdapter and
 * BigIntegerAdapter with fixed implementations that emit JSON numbers instead
 * of JSON strings.
 *
 * Called from generate.ts (after successful generation) and generate.test.ts
 * (in the drift test regeneration path) so both the real output and the temp
 * drift comparison output get the fix.
 */
import * as fs from 'fs';
import * as path from 'path';

const BIG_DECIMAL_ADAPTER_SRC = `package com.spicyhome.client.infrastructure

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
`;

const BIG_INTEGER_ADAPTER_SRC = `package com.spicyhome.client.infrastructure

import com.squareup.moshi.FromJson
import com.squareup.moshi.JsonDataException
import com.squareup.moshi.JsonReader
import com.squareup.moshi.JsonWriter
import com.squareup.moshi.ToJson
import java.math.BigInteger

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
`;

export function patchAdapters(outDir: string): void {
  const infraDir = path.join(
    outDir,
    'src',
    'main',
    'kotlin',
    'com',
    'spicyhome',
    'client',
    'infrastructure',
  );

  if (!fs.existsSync(infraDir)) {
    console.warn('patch-adapters: infrastructure dir not found, skipping patch');
    return;
  }

  fs.writeFileSync(path.join(infraDir, 'BigDecimalAdapter.kt'), BIG_DECIMAL_ADAPTER_SRC, 'utf-8');
  fs.writeFileSync(path.join(infraDir, 'BigIntegerAdapter.kt'), BIG_INTEGER_ADAPTER_SRC, 'utf-8');

  console.log('Patched BigDecimalAdapter and BigIntegerAdapter for JSON number serialization.');
}
