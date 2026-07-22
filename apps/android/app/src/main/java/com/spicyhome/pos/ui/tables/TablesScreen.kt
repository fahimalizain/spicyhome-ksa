package com.spicyhome.pos.ui.tables

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.spicyhome.pos.ui.theme.*
import kotlinx.coroutines.delay

@Composable
fun TablesScreen(
    viewModel: TablesViewModel,
    onBack: () -> Unit,
    onOpenTable: (tableId: Long, orderId: Long?) -> Unit,
) {
    val state by viewModel.uiState.collectAsState()
    var nowSeconds by remember { mutableLongStateOf(System.currentTimeMillis() / 1000) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(10_000)
            nowSeconds = System.currentTimeMillis() / 1000
        }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(DarkSurface)
                .padding(horizontal = 16.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TextButton(onClick = onBack) {
                Text("← Back", color = Accent, fontSize = 16.sp)
            }
            Text(
                text = "Tables",
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold,
                color = OnDark,
            )
            TextButton(onClick = { viewModel.loadTables() }) {
                Text("Refresh", color = Accent, fontSize = 16.sp)
            }
        }

        if (state.isLoading) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator(color = Accent)
            }
        } else if (state.error != null) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(state.error!!, color = Error, fontSize = 16.sp)
                    Spacer(modifier = Modifier.height(12.dp))
                    Button(onClick = { viewModel.loadTables() }) {
                        Text("Retry")
                    }
                }
            }
        } else if (state.tables.isEmpty()) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center,
            ) {
                Text("No tables configured", color = OnDarkSecondary, fontSize = 18.sp)
            }
        } else {
            LazyVerticalGrid(
                columns = GridCells.Adaptive(minSize = 160.dp),
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(12.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(state.tables, key = { it.table.id }) { card ->
                    TableCardView(card = card, nowSeconds = nowSeconds, onOpenTable = onOpenTable)
                }
            }
        }
    }
}

@Composable
private fun TableCardView(card: TableCard, nowSeconds: Long, onOpenTable: (Long, Long?) -> Unit) {
    val isOccupied = card.openOrder != null
    val borderColor = if (isOccupied) Warning else DarkSurfaceVariant
    val statusColor = if (isOccupied) Warning else OnDarkSecondary
    val statusText = if (isOccupied) {
        val elapsedSec = nowSeconds - card.openOrder!!.createdAt.toLong()
        formatElapsed(elapsedSec)
    } else {
        "Free"
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .border(2.dp, borderColor, RoundedCornerShape(12.dp))
            .clickable { onOpenTable(card.table.id.toLong(), card.openOrder?.id?.toLong()) },
        colors = CardDefaults.cardColors(containerColor = DarkSurfaceVariant),
        shape = RoundedCornerShape(12.dp),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = card.table.name,
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
                color = OnDark,
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = statusText,
                fontSize = 16.sp,
                color = statusColor,
            )
        }
    }
}

private fun formatElapsed(totalSec: Long): String {
    if (totalSec < 60) {
        return "<1m"
    }
    val minutes = totalSec / 60
    if (minutes < 60) {
        return "${minutes}m"
    }
    val hours = minutes / 60
    val remMinutes = minutes % 60
    if (remMinutes == 0L) {
        return "${hours}h"
    }
    return "${hours}h ${remMinutes}m"
}
