package com.spicyhome.pos.data.api

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class RestBaseUrlTest {

    @Test
    fun `plain origin gets api suffix`() {
        assertThat(restBaseUrl("http://192.168.1.10:3742"))
            .isEqualTo("http://192.168.1.10:3742/api")
    }

    @Test
    fun `trailing slash is trimmed before appending api`() {
        assertThat(restBaseUrl("http://192.168.1.10:3742/"))
            .isEqualTo("http://192.168.1.10:3742/api")
    }

    @Test
    fun `already ending in api is not doubled`() {
        assertThat(restBaseUrl("http://192.168.1.10:3742/api"))
            .isEqualTo("http://192.168.1.10:3742/api")
    }

    @Test
    fun `api with trailing slash is normalized`() {
        assertThat(restBaseUrl("http://host:3742/api/"))
            .isEqualTo("http://host:3742/api")
    }

    @Test
    fun `surrounding whitespace is trimmed`() {
        assertThat(restBaseUrl("  http://192.168.1.10:3742  "))
            .isEqualTo("http://192.168.1.10:3742/api")
    }

    @Test
    fun `https origin gets api suffix`() {
        assertThat(restBaseUrl("https://pos.example.com"))
            .isEqualTo("https://pos.example.com/api")
    }
}