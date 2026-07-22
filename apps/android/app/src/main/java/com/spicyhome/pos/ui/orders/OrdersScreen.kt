package com.spicyhome.pos.ui.orders

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.spicyhome.client.models.OrderResponse
import com.spicyhome.pos.ui.theme.*
import com.spicyhome.pos.util.MoneyFormatter

@Composable
fun OrdersScreen(
    viewModel: OrdersViewModel,
    onBack: () -> Unit,
) {
    val state by viewModel.uiState.collectAsState()

    if (state.showDetail && state.selectedOrder != null) {
        OrderDetailView(
            order = state.selectedOrder!!,
            onBack = { viewModel.closeDetail() },
        )
        return
    }

    Column(modifier = Modifier.fillMaxSize()) {
        // Top bar
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
                text = "Today's Orders",
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold,
                color = OnDark,
            )
            TextButton(onClick = { viewModel.loadOrders() }) {
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
                    Button(onClick = { viewModel.loadOrders() }) {
                        Text("Retry")
                    }
                }
            }
        } else if (state.orders.isEmpty()) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center,
            ) {
                Text("No orders today", color = OnDarkSecondary, fontSize = 18.sp)
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(state.orders, key = { it.id }) { order ->
                    OrderCard(order = order, onClick = { viewModel.selectOrder(order) })
                }
            }
        }
    }
}

@Composable
private fun OrderCard(order: OrderResponse, onClick: () -> Unit) {
    val statusColor = when (order.status) {
        "paid" -> Success
        "sent" -> StatusSent
        "voided" -> StatusVoided
        else -> StatusOpen
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = DarkSurfaceVariant),
        shape = RoundedCornerShape(8.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column {
                Text(
                    text = "Order #${order.orderNo}",
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    color = OnDark,
                )
                Text(
                    text = order.type.uppercase(),
                    fontSize = 13.sp,
                    color = OnDarkSecondary,
                )
                if (order.items.isNotEmpty()) {
                    Text(
                        text = "${order.items.size} items",
                        fontSize = 13.sp,
                        color = OnDarkSecondary,
                    )
                }
            }

            Column(horizontalAlignment = Alignment.End) {
                Text(
                    text = MoneyFormatter.halalasToSar(order.totalHalalas),
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    color = Accent,
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = order.status.uppercase(),
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium,
                    color = statusColor,
                )
            }
        }
    }
}

@Composable
private fun OrderDetailView(
    order: OrderResponse,
    onBack: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        // Detail top bar
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
                text = "Order #${order.orderNo}",
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold,
                color = OnDark,
            )
            Text(
                text = order.status.uppercase(),
                fontSize = 16.sp,
                color = when (order.status) {
                    "paid" -> Success
                    "sent" -> StatusSent
                    "voided" -> StatusVoided
                    else -> StatusOpen
                },
            )
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp),
        ) {
            Card(
                colors = CardDefaults.cardColors(containerColor = DarkSurfaceVariant),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text("Type:", color = OnDarkSecondary, fontSize = 14.sp)
                        Text(order.type, color = OnDark, fontSize = 14.sp)
                    }
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text("Items:", color = OnDarkSecondary, fontSize = 14.sp)
                        Text("${order.items.size}", color = OnDark, fontSize = 14.sp)
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    Divider(color = DarkSurfaceVariant)
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text("Subtotal", color = OnDarkSecondary, fontSize = 14.sp)
                        Text(
                            MoneyFormatter.halalasToSar(order.subtotalHalalas),
                            color = OnDark,
                            fontSize = 14.sp,
                        )
                    }
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text("VAT", color = OnDarkSecondary, fontSize = 14.sp)
                        Text(
                            MoneyFormatter.halalasToSar(order.vatHalalas),
                            color = OnDark,
                            fontSize = 14.sp,
                        )
                    }
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text("Total", color = OnDark, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                        Text(
                            MoneyFormatter.halalasToSar(order.totalHalalas),
                            color = Accent,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            Text("Items", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = OnDark)

            Spacer(modifier = Modifier.height(8.dp))

            if (order.items.isNotEmpty()) {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    items(order.items, key = { it.id }) { item ->
                        Card(
                            colors = CardDefaults.cardColors(
                                containerColor = DarkSurfaceVariant.copy(alpha = 0.5f),
                            ),
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(12.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = item.itemName,
                                        fontSize = 15.sp,
                                        color = OnDark,
                                    )
                                    Text(
                                        text = "Qty: ${item.qty} × ${MoneyFormatter.halalasToSar(item.unitPriceHalalas)}",
                                        fontSize = 12.sp,
                                        color = OnDarkSecondary,
                                    )
                                }
                                Text(
                                    text = MoneyFormatter.halalasToSar(
                                        item.unitPriceHalalas.multiply(item.qty)
                                    ),
                                    fontSize = 15.sp,
                                    fontWeight = FontWeight.Medium,
                                    color = Accent,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
