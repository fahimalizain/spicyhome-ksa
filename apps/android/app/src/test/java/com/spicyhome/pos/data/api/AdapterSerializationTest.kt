package com.spicyhome.pos.data.api

import com.google.common.truth.Truth.assertThat
import com.squareup.moshi.JsonDataException
import com.squareup.moshi.Types
import com.spicyhome.client.infrastructure.Serializer
import com.spicyhome.client.models.AddOrderItemDto
import com.spicyhome.client.models.CreateOrderDto
import com.spicyhome.client.models.CreateOrderResponse
import com.spicyhome.client.models.OrderResponse
import com.spicyhome.client.models.OrderSummaryResponse
import org.junit.Assert.assertThrows
import org.junit.Test
import java.math.BigDecimal
import java.math.BigInteger

class AdapterSerializationTest {

    private val moshi = Serializer.moshi

    // -- BigDecimal direct adapter tests (adapter is still registered, P0/P1) --

    @Test
    fun `BigDecimalAdapter toJson emits JSON number not string`() {
        val adapter = moshi.adapter(BigDecimal::class.java)
        val json = adapter.toJson(BigDecimal.valueOf(4))
        assertThat(json).isEqualTo("4")
        assertThat(json).doesNotContain("\"")
    }

    @Test
    fun `BigDecimalAdapter toJson null emits null`() {
        // Test nullable adapter variant
        val adapter = moshi.adapter(BigDecimal::class.java)
        val json = adapter.toJson(null)
        assertThat(json).isEqualTo("null")
    }

    @Test
    fun `BigDecimalAdapter fromJson accepts JSON number`() {
        val adapter = moshi.adapter(BigDecimal::class.java)
        val result = adapter.fromJson("4")
        assertThat(result).isEqualTo(BigDecimal.valueOf(4))
    }

    @Test
    fun `BigDecimalAdapter fromJson accepts JSON string`() {
        val adapter = moshi.adapter(BigDecimal::class.java)
        val result = adapter.fromJson("\"4\"")
        assertThat(result).isEqualTo(BigDecimal.valueOf(4))
    }

    @Test
    fun `BigDecimalAdapter fromJson handles null`() {
        val adapter = moshi.adapter(BigDecimal::class.java)
        val nullResult = adapter.fromJson("null")
        assertThat(nullResult).isNull()
    }

    @Test
    fun `BigDecimalAdapter handles large money value as number`() {
        val adapter = moshi.adapter(BigDecimal::class.java)
        // SAR 1000.00 = 100000 halalas
        val value = BigDecimal.valueOf(100000)
        val json = adapter.toJson(value)
        assertThat(json).isEqualTo("100000")
        assertThat(json).doesNotContain("\"")
        val parsed = adapter.fromJson("100000")
        assertThat(parsed).isEqualTo(value)
    }

    @Test
    fun `BigDecimalAdapter handles zero`() {
        val adapter = moshi.adapter(BigDecimal::class.java)
        val json = adapter.toJson(BigDecimal.ZERO)
        assertThat(json).isEqualTo("0")
        val parsed = adapter.fromJson("0")
        assertThat(parsed).isEqualTo(BigDecimal.ZERO)
    }

    // -- BigInteger direct adapter tests --

    @Test
    fun `BigIntegerAdapter toJson emits JSON number not string`() {
        val adapter = moshi.adapter(BigInteger::class.java)
        val json = adapter.toJson(BigInteger.valueOf(42))
        assertThat(json).isEqualTo("42")
        assertThat(json).doesNotContain("\"")
    }

    @Test
    fun `BigIntegerAdapter fromJson accepts JSON number`() {
        val adapter = moshi.adapter(BigInteger::class.java)
        val result = adapter.fromJson("42")
        assertThat(result).isEqualTo(BigInteger.valueOf(42))
    }

    @Test
    fun `BigIntegerAdapter fromJson accepts JSON string`() {
        val adapter = moshi.adapter(BigInteger::class.java)
        val result = adapter.fromJson("\"42\"")
        assertThat(result).isEqualTo(BigInteger.valueOf(42))
    }

    @Test
    fun `BigIntegerAdapter fromJson handles null`() {
        val adapter = moshi.adapter(BigInteger::class.java)
        val nullResult = adapter.fromJson("null")
        assertThat(nullResult).isNull()
    }

    // -- CreateOrderDto serialization (tableId is now Long? not BigDecimal) --

    @Test
    fun `CreateOrderDto tableId serializes as JSON number not string`() {
        val dto = CreateOrderDto(
            type = CreateOrderDto.Type.dine_in,
            tableId = 4L
        )
        val json = moshi.adapter(CreateOrderDto::class.java).toJson(dto)
        assertThat(json).contains("\"tableId\":4")
        assertThat(json).doesNotContain("\"tableId\":\"4\"")
        assertThat(json).doesNotContain("\"tableId\":\"")
    }

    @Test
    fun `CreateOrderDto null tableId is omitted from JSON`() {
        val dto = CreateOrderDto(
            type = CreateOrderDto.Type.takeaway,
            tableId = null
        )
        val json = moshi.adapter(CreateOrderDto::class.java).toJson(dto)
        // KotlinJsonAdapterFactory omits fields that equal their default value (null).
        // This is fine — the server treats a missing optional field the same as null.
        assertThat(json).doesNotContain("tableId")
    }

    @Test
    fun `CreateOrderDto type enum serializes as string`() {
        val dto = CreateOrderDto(
            type = CreateOrderDto.Type.dine_in,
            tableId = 1L
        )
        val json = moshi.adapter(CreateOrderDto::class.java).toJson(dto)
        assertThat(json).contains("\"type\":\"dine_in\"")
    }

    // -- AddOrderItemDto serialization (itemId is now Long, qty is now Int) --

    @Test
    fun `AddOrderItemDto numeric fields serialize as JSON numbers`() {
        val dto = AddOrderItemDto(
            itemId = 100L,
            qty = 5,
            notes = "no onions"
        )
        val json = moshi.adapter(AddOrderItemDto::class.java).toJson(dto)
        assertThat(json).contains("\"itemId\":100")
        assertThat(json).contains("\"qty\":5")
        assertThat(json).doesNotContain("\"itemId\":\"")
        assertThat(json).doesNotContain("\"qty\":\"")
    }

    @Test
    fun `AddOrderItemDto qty equals one serializes as number 1`() {
        val dto = AddOrderItemDto(
            itemId = 1L,
            qty = 1,
            notes = null
        )
        val json = moshi.adapter(AddOrderItemDto::class.java).toJson(dto)
        assertThat(json).contains("\"qty\":1")
        assertThat(json).doesNotContain("\"qty\":\"1\"")
    }

    @Test
    fun `AddOrderItemDto null notes is omitted from JSON`() {
        val dto = AddOrderItemDto(
            itemId = 1L,
            qty = 1,
            notes = null
        )
        val json = moshi.adapter(AddOrderItemDto::class.java).toJson(dto)
        // KotlinJsonAdapterFactory omits fields that equal their default value (null).
        assertThat(json).doesNotContain("notes")
    }

    // -- CreateOrderResponse deserialization (id and orderNo are now Long) --

    @Test
    fun `CreateOrderResponse deserializes from JSON with number fields`() {
        val json = """{"id":42,"uuid":"abc-123","orderNo":1001}"""
        val response = moshi.adapter(CreateOrderResponse::class.java).fromJson(json)
        assertThat(response).isNotNull()
        assertThat(response!!.id).isEqualTo(42L)
        assertThat(response.uuid).isEqualTo("abc-123")
        assertThat(response.orderNo).isEqualTo(1001L)
    }

    @Test
    fun `CreateOrderResponse round-trips faithfully`() {
        val original = CreateOrderResponse(
            id = 42L,
            uuid = "abc-123",
            orderNo = 1001L
        )
        val json = moshi.adapter(CreateOrderResponse::class.java).toJson(original)
        val roundTripped = moshi.adapter(CreateOrderResponse::class.java).fromJson(json)
        assertThat(roundTripped).isNotNull()
        assertThat(roundTripped!!.id).isEqualTo(original.id)
        assertThat(roundTripped.uuid).isEqualTo(original.uuid)
        assertThat(roundTripped.orderNo).isEqualTo(original.orderNo)
    }

    // -- Round-trip for write DTOs --

    @Test
    fun `CreateOrderDto round-trips faithfully`() {
        val original = CreateOrderDto(
            type = CreateOrderDto.Type.dine_in,
            tableId = 4L
        )
        val json = moshi.adapter(CreateOrderDto::class.java).toJson(original)
        val roundTripped = moshi.adapter(CreateOrderDto::class.java).fromJson(json)
        assertThat(roundTripped).isNotNull()
        assertThat(roundTripped!!.type).isEqualTo(original.type)
        assertThat(roundTripped.tableId).isEqualTo(original.tableId)
    }

    @Test
    fun `CreateOrderDto deserializes JSON with explicit null tableId`() {
        val json = """{"type":"dine_in","tableId":null}"""
        val dto = moshi.adapter(CreateOrderDto::class.java).fromJson(json)
        assertThat(dto).isNotNull()
        assertThat(dto!!.type).isEqualTo(CreateOrderDto.Type.dine_in)
        assertThat(dto.tableId).isNull()
    }

    @Test
    fun `AddOrderItemDto round-trips faithfully`() {
        val original = AddOrderItemDto(
            itemId = 100L,
            qty = 5,
            notes = "no onions"
        )
        val json = moshi.adapter(AddOrderItemDto::class.java).toJson(original)
        val roundTripped = moshi.adapter(AddOrderItemDto::class.java).fromJson(json)
        assertThat(roundTripped).isNotNull()
        assertThat(roundTripped!!.itemId).isEqualTo(original.itemId)
        assertThat(roundTripped.qty).isEqualTo(original.qty)
        assertThat(roundTripped.notes).isEqualTo(original.notes)
    }

    // -- OrderSummaryResponse deserialization (no items/auditLog fields) --

    @Test
    fun `OrderSummaryResponse deserializes from list JSON without items or auditLog`() {
        val json = """
            {
                "id": 1,
                "orderNo": 100,
                "uuid": "abc-123",
                "type": "dine_in",
                "tableId": 5,
                "dayOpeningId": 1,
                "status": "open",
                "subtotalHalalas": 4000,
                "vatHalalas": 600,
                "totalHalalas": 4600,
                "discountHalalas": 0,
                "createdAt": 1700000000,
                "updatedAt": 1700000000,
                "createdBy": 1,
                "updatedBy": 1
            }
        """.trimIndent()
        val response = moshi.adapter(OrderSummaryResponse::class.java).fromJson(json)
        assertThat(response).isNotNull()
        assertThat(response!!.id).isEqualTo(1L)
        assertThat(response.orderNo).isEqualTo(100L)
        assertThat(response.type).isEqualTo("dine_in")
        assertThat(response.status).isEqualTo("open")
        assertThat(response.totalHalalas).isEqualTo(4600L)
    }

    @Test
    fun `OrderSummaryResponse list deserializes from array JSON`() {
        val json = """
            [
                {
                    "id": 1,
                    "orderNo": 100,
                    "uuid": "abc-123",
                    "type": "dine_in",
                    "tableId": 5,
                    "dayOpeningId": 1,
                    "status": "open",
                    "subtotalHalalas": 4000,
                    "vatHalalas": 600,
                    "totalHalalas": 4600,
                    "discountHalalas": 0,
                    "createdAt": 1700000000,
                    "updatedAt": 1700000000,
                    "createdBy": 1,
                    "updatedBy": 1
                },
                {
                    "id": 2,
                    "orderNo": 101,
                    "uuid": "def-456",
                    "type": "takeaway",
                    "tableId": null,
                    "dayOpeningId": 1,
                    "status": "open",
                    "subtotalHalalas": 2000,
                    "vatHalalas": 300,
                    "totalHalalas": 2300,
                    "discountHalalas": 0,
                    "createdAt": 1700000000,
                    "updatedAt": 1700000000,
                    "createdBy": 2,
                    "updatedBy": 2
                }
            ]
        """.trimIndent()
        val listType = Types.newParameterizedType(List::class.java, OrderSummaryResponse::class.java)
        val adapter = moshi.adapter<List<OrderSummaryResponse>>(listType)
        val response = adapter.fromJson(json)
        assertThat(response).isNotNull()
        assertThat(response!!).hasSize(2)
        assertThat(response[0].id).isEqualTo(1L)
        assertThat(response[1].id).isEqualTo(2L)
    }

    @Test
    fun `OrderResponse requires items field and fails without it`() {
        // Full OrderResponse must have items; summary JSON (without items) should fail
        val json = """
            {
                "id": 1,
                "orderNo": 100,
                "uuid": "abc-123",
                "type": "dine_in",
                "tableId": 5,
                "dayOpeningId": 1,
                "status": "open",
                "subtotalHalalas": 4000,
                "vatHalalas": 600,
                "totalHalalas": 4600,
                "discountHalalas": 0,
                "createdAt": 1700000000,
                "updatedAt": 1700000000,
                "createdBy": 1,
                "updatedBy": 1,
                "auditLog": []
            }
        """.trimIndent()
        // OrderResponse requires both items and auditLog — missing items => should throw
        assertThrows(JsonDataException::class.java) {
            moshi.adapter(OrderResponse::class.java).fromJson(json)
        }
    }
}
