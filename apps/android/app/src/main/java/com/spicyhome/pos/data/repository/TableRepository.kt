package com.spicyhome.pos.data.repository

import com.spicyhome.client.apis.TablesApi
import com.spicyhome.client.models.TableResponse
import retrofit2.Call

class TableRepository(private val tablesApi: TablesApi) {

    fun listTables(): Call<List<TableResponse>> {
        return tablesApi.tablesControllerList()
    }
}
