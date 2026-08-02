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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.spicyhome.client.models.OrderResponse
import com.spicyhome.client.models.OrderSummaryResponse
import com.spicyhome.pos.ui.theme.*
import com.spicyhome.pos.util.MoneyFormatter

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrdersScreen(
    viewModel: OrdersViewModel,
    onBack: () -> Unit,
    onContinue: (Long) -> Unit = {},
) {
    val state by viewModel.uiState.collectAsState()

    if (state.showDetail) {
        if (state.detailLoading) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator(color = Accent)
                    Spacer(modifier = Modifier.height(12.dp))
                    Text("Loading order details...", color = OnDarkSecondary, fontSize = 16.sp)
                }
            }
        } else if (state.selectedOrder != null) {
            OrderDetailView(
                order = state.selectedOrder!!,
                tableName = resolveOrderTableName(
                    state.selectedOrder!!.type,
                    state.selectedOrder!!.tableId,
                    state.tablesById,
                ),
                onBack = { viewModel.closeDetail() },
                onContinue = onContinue,
            )
        } else {
            // Detail failed to load, show error
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(state.error ?: "Failed to load", color = Error, fontSize = 16.sp)
                    Spacer(modifier = Modifier.height(12.dp))
                    Button(onClick = { viewModel.closeDetail() }) {
                        Text("Back")
                    }
                }
            }
        }
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

        OrdersFilterBar(
            state = state,
            onToggleStatus = { viewModel.toggleStatus(it) },
            onUserChange = { viewModel.setUserId(it) },
        )

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
                Text("No orders match filters", color = OnDarkSecondary, fontSize = 18.sp)
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(state.orders, key = { it.id }) { order ->
                    OrderCard(
                        order = order,
                        tableName = resolveOrderTableName(order.type, order.tableId, state.tablesById),
                        onClick = { viewModel.selectOrder(order) },
                    )
                }
            }
        }
    }
}

/** Status accent color for the active filter pill (matches OrderCard/OrderScreen). */
private fun statusPillColor(status: String): Color = when (status) {
    "paid" -> StatusPaid
    "voided" -> StatusVoided
    "refunded" -> StatusRefunded
    else -> StatusOpen
}

/**
 * Server-side filter bar: user (dropdown, default = current user), status
 * (multiselect chips). The date is always today (Asia/Riyadh) and is not
 * user-selectable. Every change reloads the list through the ViewModel.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun OrdersFilterBar(
    state: OrdersUiState,
    onToggleStatus: (String) -> Unit,
    onUserChange: (Long?) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(DarkSurface)
            .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        ORDER_FILTER_STATUSES.forEach { status ->
            val selected = status in state.statuses
            val statusColor = statusPillColor(status)
            FilterChip(
                selected = selected,
                onClick = { onToggleStatus(status) },
                label = {
                    Text(
                        status.replaceFirstChar { it.uppercase() },
                        color = if (selected) OnDark else OnDarkSecondary,
                        fontSize = 13.sp,
                        maxLines = 1,
                    )
                },
                modifier = Modifier.height(36.dp),
                shape = RoundedCornerShape(percent = 50),
                colors = FilterChipDefaults.filterChipColors(
                    containerColor = DarkSurfaceVariant,
                    labelColor = OnDarkSecondary,
                    selectedContainerColor = statusColor.copy(alpha = 0.3f),
                    selectedLabelColor = OnDark,
                ),
                border = FilterChipDefaults.filterChipBorder(
                    enabled = true,
                    selected = selected,
                    borderColor = OnDarkSecondary.copy(alpha = 0.35f),
                    selectedBorderColor = statusColor,
                ),
            )
        }

        Spacer(modifier = Modifier.weight(1f))
        UserFilterDropdown(state = state, onUserChange = onUserChange)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun UserFilterDropdown(
    state: OrdersUiState,
    onUserChange: (Long?) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    val selectedLabel = state.users.firstOrNull { it.id == state.userId }
        ?.let { it.name.ifBlank { it.username } }
        ?: "All users"

    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { expanded = it },
    ) {
        OutlinedButton(
            onClick = { expanded = true },
            modifier = Modifier.menuAnchor(),
        ) {
            Text(selectedLabel, color = Accent, fontSize = 14.sp, maxLines = 1)
            Text(" ▾", color = Accent, fontSize = 14.sp)
        }
        ExposedDropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
        ) {
            DropdownMenuItem(
                text = { Text("All users") },
                onClick = {
                    onUserChange(null)
                    expanded = false
                },
            )
            state.users.forEach { user ->
                DropdownMenuItem(
                    text = { Text(user.name.ifBlank { user.username }) },
                    onClick = {
                        onUserChange(user.id)
                        expanded = false
                    },
                )
            }
        }
    }
}

@Composable
private fun OrderCard(order: OrderSummaryResponse, tableName: String?, onClick: () -> Unit) {
    val statusColor = when (order.status) {
        "paid" -> Success
        "voided" -> StatusVoided
        "refunded" -> StatusRefunded
        else -> StatusOpen
    }
    // Middle-dot pattern matching the OrderScreen header: "INV26-42 · T12".
    val title = if (tableName != null) {
        listOfNotNull(order.documentId.takeIf { it.isNotBlank() }, tableName).joinToString(" · ")
    } else {
        order.documentId
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
                    text = title,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    color = OnDark,
                )
                Text(
                    text = order.type.uppercase(),
                    fontSize = 13.sp,
                    color = OnDarkSecondary,
                )
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
    tableName: String?,
    onBack: () -> Unit,
    onContinue: (Long) -> Unit = {},
) {
    // Middle-dot pattern: "INV26-42 · T12"; table segment only for dine-in.
    val detailTitle = listOfNotNull(
        order.documentId.takeIf { it.isNotBlank() },
        tableName,
    ).joinToString(" · ")

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
                text = detailTitle,
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold,
                color = OnDark,
            )
            Text(
                text = order.status.uppercase(),
                fontSize = 16.sp,
                color = when (order.status) {
                    "paid" -> Success
                    "voided" -> StatusVoided
                    "refunded" -> StatusRefunded
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
                    if (tableName != null) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text("Table:", color = OnDarkSecondary, fontSize = 14.sp)
                            Text(tableName, color = OnDark, fontSize = 14.sp)
                        }
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

            // Payments section (display when non-empty)
            if (order.payments.isNotEmpty()) {
                Spacer(modifier = Modifier.height(12.dp))
                Text("Payments", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = OnDarkSecondary)
                Spacer(modifier = Modifier.height(4.dp))
                order.payments.forEach { payment ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(payment.methodTitle, color = OnDarkSecondary, fontSize = 14.sp)
                        Text(
                            MoneyFormatter.halalasToSar(payment.amountHalalas),
                            color = OnDark,
                            fontSize = 14.sp,
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
                                        item.unitPriceHalalas * item.qty
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

            // Continue Editing button for open orders
            if (order.status == "open") {
                Spacer(modifier = Modifier.height(12.dp))
                Button(
                    onClick = { onContinue(order.id.toLong()) },
                    colors = ButtonDefaults.buttonColors(containerColor = Accent),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Continue Editing", fontSize = 16.sp)
                }
            }
        }
    }
}

/**
 * Resolve the table name for an order card/detail header.
 *
 * Table segment only for dine-in orders with a known table id whose name is
 * loaded (and non-blank). Returns null when the tables map is not loaded yet,
 * the table is unknown, or the order is not dine-in — the UI omits the segment.
 */
private fun resolveOrderTableName(
    type: String,
    tableId: Long?,
    tablesById: Map<Long, String>,
): String? {
    if (type != "dine_in" || tableId == null) return null
    return tablesById[tableId]?.takeIf { it.isNotBlank() }
}
