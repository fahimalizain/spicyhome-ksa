package com.spicyhome.pos.data.repository

import com.google.common.truth.Truth.assertThat
import com.spicyhome.client.apis.AuthApi
import com.spicyhome.client.models.LoginDto
import com.spicyhome.client.models.LoginResponse
import com.spicyhome.client.models.MeResponse
import io.mockk.MockKAnnotations
import io.mockk.every
import io.mockk.impl.annotations.MockK
import io.mockk.verify
import org.junit.Before
import org.junit.Test
import retrofit2.Call
import retrofit2.Response
import java.math.BigDecimal

class AuthRepositoryTest {

    @MockK
    private lateinit var authApi: AuthApi

    @MockK
    private lateinit var loginCall: Call<LoginResponse>

    @MockK
    private lateinit var meCall: Call<MeResponse>

    private lateinit var repository: AuthRepository

    @Before
    fun setUp() {
        MockKAnnotations.init(this)
        repository = AuthRepository(authApi)
    }

    @Test
    fun `login delegates to authApi with correct DTO`() {
        every { authApi.authControllerLogin(any()) } returns loginCall

        val result = repository.login("admin", "1234")

        assertThat(result).isSameInstanceAs(loginCall)
        verify {
            authApi.authControllerLogin(match { dto ->
                dto.username == "admin" && dto.pin == "1234"
            })
        }
    }

    @Test
    fun `login success returns token`() {
        val expectedToken = "eyJhbGciOiJIUzI1NiJ9.xxx"
        val response = Response.success(LoginResponse(accessToken = expectedToken))

        every { authApi.authControllerLogin(any()) } returns loginCall
        every { loginCall.execute() } returns response

        val result = repository.login("user", "9999").execute()

        assertThat(result.isSuccessful).isTrue()
        assertThat(result.body()?.accessToken).isEqualTo(expectedToken)
    }

    @Test
    fun `login failure returns error`() {
        val response = Response.error<LoginResponse>(401, okhttp3.ResponseBody.create(null, ""))

        every { authApi.authControllerLogin(any()) } returns loginCall
        every { loginCall.execute() } returns response

        val result = repository.login("bad", "0000").execute()

        assertThat(result.isSuccessful).isFalse()
        assertThat(result.code()).isEqualTo(401)
    }

    @Test
    fun `getMe delegates to authApi`() {
        every { authApi.authControllerGetMe() } returns meCall

        val result = repository.getMe()

        assertThat(result).isSameInstanceAs(meCall)
        verify { authApi.authControllerGetMe() }
    }

    @Test
    fun `getMe returns user info`() {
        val me = MeResponse(
            id = BigDecimal.ONE,
            username = "admin",
            name = "Admin User",
            roleId = BigDecimal.ONE,
            isActive = true,
            roleName = "manager",
            createOrder = true,
            updateOrder = true,
            deleteOrderItem = true,
            voidOrder = true,
            refundOrder = true,
            manageMenu = true,
            manageTables = true,
            managePrinters = true,
            manageUsers = true,
            manageSettings = true,
        )
        every { authApi.authControllerGetMe() } returns meCall
        every { meCall.execute() } returns Response.success(me)

        val result = repository.getMe().execute()

        assertThat(result.isSuccessful).isTrue()
        assertThat(result.body()?.username).isEqualTo("admin")
        assertThat(result.body()?.roleName).isEqualTo("manager")
    }
}
