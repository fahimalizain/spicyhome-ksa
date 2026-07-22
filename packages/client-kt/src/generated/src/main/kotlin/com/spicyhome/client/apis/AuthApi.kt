package com.spicyhome.client.apis

import com.spicyhome.client.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Call
import okhttp3.RequestBody
import com.squareup.moshi.Json

import com.spicyhome.client.models.CreateRoleDto
import com.spicyhome.client.models.CreateUserDto
import com.spicyhome.client.models.LoginDto
import com.spicyhome.client.models.LoginResponse
import com.spicyhome.client.models.MeResponse
import com.spicyhome.client.models.RoleResponse
import com.spicyhome.client.models.UpdateRoleDto
import com.spicyhome.client.models.UpdateUserDto
import com.spicyhome.client.models.UserResponse

interface AuthApi {
    /**
     * POST auth/roles
     * Create a new role
     * 
     * Responses:
     *  - 201: Created role
     *
     * @param createRoleDto 
     * @return [Call]<[RoleResponse]>
     */
    @POST("auth/roles")
    fun authControllerCreateRole(@Body createRoleDto: CreateRoleDto): Call<RoleResponse>

    /**
     * POST auth/users
     * Create a new user
     * 
     * Responses:
     *  - 201: Created user
     *
     * @param createUserDto 
     * @return [Call]<[UserResponse]>
     */
    @POST("auth/users")
    fun authControllerCreateUser(@Body createUserDto: CreateUserDto): Call<UserResponse>

    /**
     * GET auth/me
     * Get current user info with role permissions
     * 
     * Responses:
     *  - 200: Current user details
     *
     * @return [Call]<[MeResponse]>
     */
    @GET("auth/me")
    fun authControllerGetMe(): Call<MeResponse>

    /**
     * GET auth/users/{id}
     * Get user by ID
     * 
     * Responses:
     *  - 200: User details
     *
     * @param id 
     * @return [Call]<[UserResponse]>
     */
    @GET("auth/users/{id}")
    fun authControllerGetUser(@Path("id") id: java.math.BigDecimal): Call<UserResponse>

    /**
     * GET auth/roles
     * List all roles
     * 
     * Responses:
     *  - 200: List of roles
     *
     * @return [Call]<[kotlin.collections.List<RoleResponse>]>
     */
    @GET("auth/roles")
    fun authControllerListRoles(): Call<kotlin.collections.List<RoleResponse>>

    /**
     * GET auth/users
     * List all users
     * 
     * Responses:
     *  - 200: List of users
     *
     * @return [Call]<[kotlin.collections.List<UserResponse>]>
     */
    @GET("auth/users")
    fun authControllerListUsers(): Call<kotlin.collections.List<UserResponse>>

    /**
     * POST auth/login
     * Login with username and PIN
     * 
     * Responses:
     *  - 201: JWT access token
     *
     * @param loginDto 
     * @return [Call]<[LoginResponse]>
     */
    @POST("auth/login")
    fun authControllerLogin(@Body loginDto: LoginDto): Call<LoginResponse>

    /**
     * PUT auth/roles/{id}
     * Update a role
     * 
     * Responses:
     *  - 200: Updated role
     *
     * @param id 
     * @param updateRoleDto 
     * @return [Call]<[RoleResponse]>
     */
    @PUT("auth/roles/{id}")
    fun authControllerUpdateRole(@Path("id") id: java.math.BigDecimal, @Body updateRoleDto: UpdateRoleDto): Call<RoleResponse>

    /**
     * PUT auth/users/{id}
     * Update a user
     * 
     * Responses:
     *  - 200: Updated user
     *
     * @param id 
     * @param updateUserDto 
     * @return [Call]<[UserResponse]>
     */
    @PUT("auth/users/{id}")
    fun authControllerUpdateUser(@Path("id") id: java.math.BigDecimal, @Body updateUserDto: UpdateUserDto): Call<UserResponse>

}
