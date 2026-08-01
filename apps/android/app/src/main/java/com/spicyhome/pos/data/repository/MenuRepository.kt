package com.spicyhome.pos.data.repository

import com.spicyhome.client.apis.MenuApi
import com.spicyhome.client.models.CategoryResponse
import com.spicyhome.client.models.ItemResponse
import com.spicyhome.client.models.SubcategoryResponse
import retrofit2.Call

class MenuRepository(private val menuApi: MenuApi) {

    fun listCategories(): Call<List<CategoryResponse>> {
        return menuApi.menuControllerListCategories()
    }

    fun listSubcategories(categoryId: String? = null): Call<List<SubcategoryResponse>> {
        return menuApi.menuControllerListSubcategories(categoryId ?: "")
    }

    fun listItems(categoryId: String? = null): Call<List<ItemResponse>> {
        return menuApi.menuControllerListItems(categoryId ?: "")
    }
}
