package com.spicyhome.pos.ui.order

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.spicyhome.client.models.ItemResponse
import com.spicyhome.pos.ui.theme.*
import com.spicyhome.pos.util.MoneyFormatter

@Composable
fun OrderScreen(
    viewModel: OrderViewModel,
    onViewOrders: () -> Unit,
    onViewTables: () -> Unit,
    onLogout: () -> Unit,
) {
    val state by viewModel.uiState.collectAsState()

    when (state.screenState) {
        OrderScreenState.SELECTING_TYPE -> TypeSelectionPanel(viewModel, state, onLogout)
        OrderScreenState.EDITING_ORDER -> OrderEditingPanel(viewModel, state, onViewOrders, onViewTables)
        OrderScreenState.ORDER_TERMINAL -> OrderTerminalPanel(viewModel, state)
        OrderScreenState.DAY_NOT_OPEN -> DayNotOpenPanel(viewModel, state)
    }
}

@Composable
private fun TopBar(
    title: String,
    onViewOrders: (() -> Unit)? = null,
    onViewTables: (() -> Unit)? = null,
    onLogout: (() -> Unit)? = null,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(DarkSurface)
            .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = title,
            fontSize = 22.sp,
            fontWeight = FontWeight.Bold,
            color = OnDark,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            onViewOrders?.let {
                TextButton(onClick = it) {
                    Text("Orders", color = Accent, fontSize = 16.sp)
                }
            }
            onViewTables?.let {
                TextButton(onClick = it) {
                    Text("Tables", color = Accent, fontSize = 16.sp)
                }
            }
            onLogout?.let {
                TextButton(onClick = it) {
                    Text("Logout", color = OnDarkSecondary, fontSize = 16.sp)
                }
            }
        }
    }
}

@Composable
private fun TypeSelectionPanel(viewModel: OrderViewModel, state: OrderUiState, onLogout: () -> Unit) {
    Column(modifier = Modifier.fillMaxSize()) {
        TopBar(title = "New Order", onLogout = { viewModel.logout(); onLogout() })

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text("Order Type", fontSize = 24.sp, color = OnDark)
            Spacer(modifier = Modifier.height(24.dp))

            Row(horizontalArrangement = Arrangement.spacedBy(24.dp)) {
                OrderType.values().forEach { type ->
                    val selected = state.orderType == type
                    Card(
                        modifier = Modifier
                            .width(220.dp)
                            .height(120.dp)
                            .clickable { viewModel.setOrderType(type) },
                        colors = CardDefaults.cardColors(
                            containerColor = if (selected) Accent.copy(alpha = 0.3f) else DarkSurfaceVariant,
                        ),
                        border = if (selected) androidx.compose.foundation.BorderStroke(2.dp, Accent) else null,
                    ) {
                        Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize()) {
                            Text(
                                text = when (type) {
                                    OrderType.DINE_IN -> "Dine-in"
                                    OrderType.TAKEAWAY -> "Takeaway"
                                },
                                fontSize = 22.sp,
                                fontWeight = FontWeight.Bold,
                                color = OnDark,
                            )
                        }
                    }
                }
            }

            if (state.orderType == OrderType.DINE_IN) {
                Spacer(modifier = Modifier.height(24.dp))
                Text("Select Table", fontSize = 20.sp, color = OnDark)
                Spacer(modifier = Modifier.height(12.dp))

                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    items(state.tables) { table ->
                        val tableId = table.id.toLong()
                        val selected = state.selectedTableId == tableId
                        Card(
                            modifier = Modifier
                                .width(120.dp)
                                .height(80.dp)
                                .clickable { viewModel.setTable(tableId) },
                            colors = CardDefaults.cardColors(
                                containerColor = if (selected) Accent else DarkSurfaceVariant,
                            ),
                        ) {
                            Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize()) {
                                Text(
                                    text = table.name,
                                    color = OnDark,
                                    fontSize = 18.sp,
                                )
                            }
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(32.dp))

            Button(
                onClick = { viewModel.proceedToBuild() },
                enabled = !(state.orderType == OrderType.DINE_IN && state.selectedTableId == null),
                colors = ButtonDefaults.buttonColors(containerColor = Accent),
                modifier = Modifier
                    .width(300.dp)
                    .height(56.dp),
            ) {
                Text("Start Order", fontSize = 20.sp)
            }

            if (state.error != null) {
                Spacer(modifier = Modifier.height(12.dp))
                Text(state.error, color = Error, fontSize = 14.sp)
            }
        }
    }
}

// ── Unified Editing Panel (covers both pre-create local cart and post-create server-synced cart) ──

@Composable
private fun OrderEditingPanel(
    viewModel: OrderViewModel,
    state: OrderUiState,
    onViewOrders: () -> Unit,
    onViewTables: () -> Unit,
) {
    val isServerSynced = state.currentOrderId != null
    val isOpenOrder = isServerSynced && state.currentOrder?.status == "open"

    // ── Local guard state for navigation ──
    var showLeaveGuard by remember { mutableStateOf(false) }
    var pendingNavAction by remember { mutableStateOf<(() -> Unit)?>(null) }

    // ── Wrapper that guards navigation when dirty ──
    fun guardedNavigate(action: () -> Unit) {
        if (state.isDirty == true && isOpenOrder) {
            showLeaveGuard = true
            pendingNavAction = action
        } else {
            action()
        }
    }

    Row(modifier = Modifier.fillMaxSize()) {
        // Left: categories + items
        Column(modifier = Modifier.weight(0.65f)) {
            TopBar(
                title = if (isOpenOrder) "Order #${state.currentOrder?.orderNo ?: state.currentOrderId}" else "New Order",
                onViewOrders = { guardedNavigate(onViewOrders) },
                onViewTables = { guardedNavigate(onViewTables) },
            )

            // Category tabs + inline search
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(DarkSurfaceVariant.copy(alpha = 0.5f))
                    .padding(horizontal = 8.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                // Left: horizontally scrollable category chips with right-edge fade
                val listState = rememberLazyListState()

                val showRightFade by remember {
                    derivedStateOf {
                        val info = listState.layoutInfo
                        val last = info.visibleItemsInfo.lastOrNull() ?: return@derivedStateOf false
                        last.index < info.totalItemsCount - 1 ||
                            last.offset + last.size > info.viewportEndOffset
                    }
                }

                val density = LocalDensity.current

                Box(
                    modifier = Modifier
                        .weight(1f)
                        .drawWithContent {
                            drawContent()
                            if (showRightFade) {
                                val fadeW = with(density) { 32.dp.toPx() }
                                drawRect(
                                    brush = Brush.horizontalGradient(
                                        colors = listOf(Color.Transparent, DarkSurfaceVariant),
                                        startX = size.width - fadeW,
                                        endX = size.width,
                                    ),
                                    topLeft = Offset(size.width - fadeW, 0f),
                                    size = Size(fadeW, size.height),
                                )
                            }
                        },
                ) {
                    LazyRow(
                        state = listState,
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        item {
                            FilterChip(
                                selected = state.selectedCategoryId == null,
                                onClick = { viewModel.selectCategory(null) },
                                label = { Text("All", fontSize = 15.sp) },
                                colors = FilterChipDefaults.filterChipColors(
                                    selectedContainerColor = Accent,
                                ),
                            )
                        }
                        items(state.categories) { cat ->
                            FilterChip(
                                selected = state.selectedCategoryId == cat.id.toLong(),
                                onClick = { viewModel.selectCategory(cat.id.toLong()) },
                                label = {
                                    Text(
                                        text = cat.name,
                                        fontSize = 15.sp,
                                        maxLines = 1,
                                    )
                                },
                                colors = FilterChipDefaults.filterChipColors(
                                    selectedContainerColor = Accent,
                                ),
                            )
                        }
                    }
                }

                Spacer(Modifier.width(8.dp))

                // Right: compact search, fixed width
                OutlinedTextField(
                    value = state.itemSearchQuery,
                    onValueChange = { viewModel.setItemSearch(it) },
                    singleLine = true,
                    placeholder = { Text("Search\u2026", color = OnDarkSecondary) },
                    modifier = Modifier
                        .widthIn(min = 140.dp, max = 200.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = Accent,
                        unfocusedBorderColor = DarkSurfaceVariant,
                        focusedTextColor = OnDark,
                        unfocusedTextColor = OnDark,
                        cursorColor = Accent,
                        focusedContainerColor = DarkSurface,
                        unfocusedContainerColor = DarkSurface,
                    ),
                    trailingIcon = {
                        if (state.itemSearchQuery.isNotEmpty()) {
                            TextButton(
                                onClick = { viewModel.setItemSearch("") },
                                modifier = Modifier.width(32.dp).height(32.dp),
                                contentPadding = PaddingValues(0.dp),
                            ) {
                                Text("\u00D7", color = OnDarkSecondary, fontSize = 18.sp)
                            }
                        }
                    },
                )
            }

            // Item grid
            if (state.isLoading) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(color = Accent)
                }
            } else if (state.filteredItems.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("No items match", color = OnDarkSecondary, fontSize = 16.sp)
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(8.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    items(state.filteredItems, key = { it.id }) { item ->
                        ItemCard(
                            item = item,
                            onClick = {
                                // D6/D14: All cart mutations are local — never call server directly
                                viewModel.addToCart(item)
                            },
                            enabled = !isServerSynced || state.permissions.updateOrder,
                        )
                    }
                }
            }
        }

        // Right: cart panel
        UnifiedCartPanel(
            state = state,
            isOpenOrder = isOpenOrder,
            onCreateOrder = { viewModel.createOrder() },
            onDecrease = { index, _ -> viewModel.decreaseQty(index) },
            onIncrease = { index, _ -> viewModel.increaseQty(index) },
            onRemove = { index, _ -> viewModel.removeFromCart(index) },
            onUpdateNotes = { index, _, notes -> viewModel.updateItemNotes(index, notes) },
            onNewOrder = { guardedNavigate { viewModel.newOrder() } },
            onSendToKitchen = { viewModel.sendToKitchen() },
            onDiscard = { viewModel.discardChanges() },
            modifier = Modifier
                .weight(0.35f)
                .fillMaxHeight(),
        )
    }

    // ── Leave guard dialog (D7) ──
    if (showLeaveGuard) {
        AlertDialog(
            onDismissRequest = { showLeaveGuard = false },
            title = { Text("Unsent Changes", color = OnDark, fontWeight = FontWeight.Bold) },
            text = { Text("You have unsent changes. What would you like to do?", color = OnDarkSecondary) },
            confirmButton = {
                TextButton(onClick = { showLeaveGuard = false }) {
                    Text("Keep Editing", color = Accent)
                }
            },
            dismissButton = {
                TextButton(onClick = {
                    viewModel.discardChanges()
                    showLeaveGuard = false
                    pendingNavAction?.invoke()
                    pendingNavAction = null
                }) {
                    Text("Discard Changes", color = OnDarkSecondary)
                }
            },
            containerColor = DarkSurface,
        )
    }

    // ── Realtime conflict dialog (D8) ──
    if (state.showRemoteConflict) {
        AlertDialog(
            onDismissRequest = {},
            title = { Text("Order Updated Elsewhere", color = OnDark, fontWeight = FontWeight.Bold) },
            text = { Text("This order was modified by another terminal. Your changes will be reset.", color = OnDarkSecondary) },
            confirmButton = {
                TextButton(onClick = { viewModel.dismissRemoteConflict() }) {
                    Text("OK", color = Accent)
                }
            },
            containerColor = DarkSurface,
        )
    }
}

@Composable
private fun ItemCard(item: ItemResponse, onClick: () -> Unit, enabled: Boolean = true) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .then(
                if (enabled) Modifier.clickable(onClick = onClick) else Modifier
            ),
        colors = CardDefaults.cardColors(
            containerColor = if (enabled) DarkSurfaceVariant else DarkSurfaceVariant.copy(alpha = 0.4f),
        ),
        shape = RoundedCornerShape(8.dp),
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
                    text = item.name,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Medium,
                    color = if (enabled) OnDark else OnDarkSecondary,
                )
                if (item.nameAr != null && item.nameAr.toString() != "null") {
                    Text(
                        text = item.nameAr.toString(),
                        fontSize = 12.sp,
                        color = OnDarkSecondary,
                    )
                }
            }
            Text(
                text = MoneyFormatter.halalasToSar(item.priceHalalas),
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                color = if (enabled) Accent else OnDarkSecondary,
                modifier = Modifier.padding(start = 8.dp),
            )
        }
    }
}

// ── Unified Cart Panel ──

@Composable
private fun UnifiedCartPanel(
    state: OrderUiState,
    isOpenOrder: Boolean,
    onCreateOrder: () -> Unit,
    onDecrease: (Int, CartItem) -> Unit,
    onIncrease: (Int, CartItem) -> Unit,
    onRemove: (Int, CartItem) -> Unit,
    onUpdateNotes: (Int, CartItem, String) -> Unit,
    onNewOrder: () -> Unit,
    onSendToKitchen: () -> Unit,
    onDiscard: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .background(DarkSurface)
            .padding(12.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = "Cart",
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
                color = OnDark,
            )
            if (state.isDirty == true) {
                Text(
                    text = "Unsent changes",
                    fontSize = 11.sp,
                    color = Warning,
                )
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        if (state.isCartEmpty) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                contentAlignment = Alignment.Center,
            ) {
                Text("Tap items to add", color = OnDarkSecondary, fontSize = 16.sp)
            }
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                itemsIndexed(state.cart.toList()) { index, cartItem ->
                    CartItemRow(
                        cartItem = cartItem,
                        onDecrease = { onDecrease(index, cartItem) },
                        onIncrease = { onIncrease(index, cartItem) },
                        onRemove = { onRemove(index, cartItem) },
                        onUpdateNotes = { notes -> onUpdateNotes(index, cartItem, notes) },
                        canMutate = !isOpenOrder || (cartItem.orderItemId != null && state.permissions.updateOrder),
                        canDelete = !isOpenOrder || (cartItem.orderItemId != null && state.permissions.deleteOrderItem),
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        // Totals
        if (!state.isCartEmpty) {
            Column(modifier = Modifier.padding(vertical = 4.dp)) {
                Divider(color = DarkSurfaceVariant)
                Spacer(modifier = Modifier.height(4.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text("Subtotal", color = OnDarkSecondary, fontSize = 14.sp)
                    Text(
                        MoneyFormatter.halalasToSar(state.cartSubtotalHalalas),
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
                        MoneyFormatter.halalasToSar(state.cartVatHalalas),
                        color = OnDark,
                        fontSize = 14.sp,
                    )
                }
                Spacer(modifier = Modifier.height(4.dp))
                Divider(color = DarkSurfaceVariant)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(
                        "${state.cartItemCount} items",
                        color = OnDark,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        MoneyFormatter.halalasToSar(state.cartTotalHalalas),
                        color = Accent,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            // Create Order button (pre-create only)
            if (!isOpenOrder) {
                if (state.permissions.createOrder) {
                    Button(
                        onClick = onCreateOrder,
                        enabled = !state.isLoading,
                        colors = ButtonDefaults.buttonColors(containerColor = Accent),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(52.dp),
                    ) {
                        Text(
                            text = if (state.isLoading) "Creating..." else "Create Order",
                            fontSize = 18.sp,
                        )
                    }
                }
            } else if (state.isDirty == true) {
                // ── Open + Dirty: Send to Kitchen + Discard (D12, D14) ──
                Button(
                    onClick = onSendToKitchen,
                    enabled = !state.isSyncing && !state.isLoading,
                    colors = ButtonDefaults.buttonColors(containerColor = Accent),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp),
                ) {
                    Text(
                        text = if (state.isSyncing) "Syncing..." else "Send to Kitchen",
                        fontSize = 18.sp,
                    )
                }
                Spacer(modifier = Modifier.height(6.dp))
                OutlinedButton(
                    onClick = onDiscard,
                    enabled = !state.isSyncing && !state.isLoading,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(44.dp),
                ) {
                    Text("Discard", fontSize = 16.sp)
                }
            } else {
                // ── Open + Clean: New Order button ──
                OutlinedButton(
                    onClick = onNewOrder,
                    enabled = !state.isLoading,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                ) {
                    Text("New Order", fontSize = 16.sp)
                }
            }
        }

        if (state.error != null) {
            Spacer(modifier = Modifier.height(4.dp))
            Text(state.error, color = Error, fontSize = 12.sp)
        }
    }
}

@Composable
private fun CartItemRow(
    cartItem: CartItem,
    onDecrease: () -> Unit,
    onIncrease: () -> Unit,
    onRemove: () -> Unit,
    onUpdateNotes: (String) -> Unit,
    canMutate: Boolean,
    canDelete: Boolean,
) {
    var showNotesDialog by remember { mutableStateOf(false) }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(DarkSurfaceVariant.copy(alpha = 0.5f), RoundedCornerShape(6.dp))
            .padding(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = cartItem.item.name,
                    fontSize = 13.sp,
                    color = OnDark,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                if (cartItem.notes.isNotBlank()) {
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = "\uD83D\uDCDD",
                        fontSize = 11.sp,
                    )
                }
                if (canMutate) {
                    TextButton(
                        onClick = { showNotesDialog = true },
                        modifier = Modifier.width(24.dp).height(24.dp),
                        contentPadding = PaddingValues(0.dp),
                    ) {
                        Text("\u270E", fontSize = 13.sp, color = OnDarkSecondary)
                    }
                }
            }
            if (cartItem.notes.isNotBlank()) {
                Text(
                    text = cartItem.notes,
                    fontSize = 10.sp,
                    color = OnDarkSecondary,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Text(
                text = "${cartItem.qty} × ${MoneyFormatter.halalasToSar(cartItem.item.priceHalalas)}",
                fontSize = 11.sp,
                color = OnDarkSecondary,
            )
        }
        if (canMutate) {
            TextButton(onClick = onDecrease, modifier = Modifier.width(36.dp)) {
                Text("-", color = Accent, fontSize = 18.sp)
            }
            Text(
                text = "${cartItem.qty}",
                color = OnDark,
                fontSize = 15.sp,
                modifier = Modifier.padding(horizontal = 4.dp),
            )
            TextButton(onClick = onIncrease, modifier = Modifier.width(36.dp)) {
                Text("+", color = Accent, fontSize = 18.sp)
            }
        } else {
            Text(
                text = "×${cartItem.qty}",
                color = OnDarkSecondary,
                fontSize = 15.sp,
                modifier = Modifier.padding(horizontal = 4.dp),
            )
        }
        if (canDelete) {
            TextButton(onClick = onRemove) {
                Text("×", color = OnDarkSecondary, fontSize = 18.sp)
            }
        }
    }

    if (showNotesDialog) {
        var notesText by remember(cartItem.notes) { mutableStateOf(cartItem.notes) }
        AlertDialog(
            onDismissRequest = { showNotesDialog = false },
            title = { Text("Item Notes", color = OnDark) },
            text = {
                OutlinedTextField(
                    value = notesText,
                    onValueChange = { notesText = it },
                    label = { Text("Notes") },
                    modifier = Modifier.fillMaxWidth(),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = Accent,
                        focusedLabelColor = Accent,
                    ),
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    onUpdateNotes(notesText)
                    showNotesDialog = false
                }) {
                    Text("Save", color = Accent)
                }
            },
            dismissButton = {
                TextButton(onClick = { showNotesDialog = false }) {
                    Text("Cancel", color = OnDarkSecondary)
                }
            },
            containerColor = DarkSurface,
        )
    }
}

// ── Read-only Terminal Panel for paid/voided/refunded orders ──

@Composable
private fun OrderTerminalPanel(viewModel: OrderViewModel, state: OrderUiState) {
    val order = state.currentOrder
    val statusColor = when (order?.status) {
        "paid" -> Success
        "voided" -> StatusVoided
        "refunded" -> StatusRefunded
        else -> StatusOpen
    }

    Column(modifier = Modifier.fillMaxSize()) {
        TopBar(title = "Order #${order?.orderNo ?: ""}")

        // Status badge
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(statusColor.copy(alpha = 0.15f))
                .padding(12.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = (order?.status ?: "").uppercase(),
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
                color = statusColor,
            )
        }

        // Items (prefer currentOrder.items over cart for terminal)
        val displayItems = order?.items ?: emptyList()

        if (displayItems.isNotEmpty()) {
            LazyColumn(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                contentPadding = PaddingValues(12.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                items(displayItems, key = { it.id }) { item ->
                    Card(
                        colors = CardDefaults.cardColors(containerColor = DarkSurfaceVariant),
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
                                    text = "Qty: ${item.qty}",
                                    fontSize = 12.sp,
                                    color = OnDarkSecondary,
                                )
                            }
                            Text(
                                text = MoneyFormatter.halalasToSar(item.totalHalalas),
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Medium,
                                color = Accent,
                            )
                        }
                    }
                }
            }
        }

        // Totals + New Order
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 32.dp, vertical = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Divider(color = DarkSurfaceVariant)
            Spacer(modifier = Modifier.height(8.dp))
            order?.let {
                Text(
                    "Total: ${MoneyFormatter.halalasToSar(it.totalHalalas)}",
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Bold,
                    color = Accent,
                )
            }
            Spacer(modifier = Modifier.height(16.dp))

            Button(
                onClick = { viewModel.newOrder() },
                enabled = !state.isLoading,
                colors = ButtonDefaults.buttonColors(containerColor = Accent),
                modifier = Modifier
                    .width(200.dp)
                    .height(64.dp),
            ) {
                Text("New Order", fontSize = 20.sp)
            }

            if (state.error != null) {
                Spacer(modifier = Modifier.height(12.dp))
                Text(state.error, color = Error, fontSize = 14.sp)
            }
        }
    }
}

// ── Day Not Open Panel (message + Refresh, no admin controls) ──

@Composable
private fun DayNotOpenPanel(viewModel: OrderViewModel, state: OrderUiState) {
    Column(modifier = Modifier.fillMaxSize()) {
        TopBar(title = "New Order")
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text("⚠", fontSize = 48.sp, color = Warning)
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                "No Open Business Day",
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold,
                color = OnDark,
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                "A business day must be opened from the POS terminal before taking orders.",
                fontSize = 16.sp,
                color = OnDarkSecondary,
                textAlign = TextAlign.Center,
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                "The tablet cannot open or close business days.",
                fontSize = 14.sp,
                color = OnDarkSecondary,
                textAlign = TextAlign.Center,
            )
            Spacer(modifier = Modifier.height(24.dp))

            if (state.error != null) {
                Text(state.error, color = Error, fontSize = 14.sp)
                Spacer(modifier = Modifier.height(12.dp))
            }

            Button(
                onClick = { viewModel.checkDayOpen() },
                enabled = !state.isLoading,
                colors = ButtonDefaults.buttonColors(containerColor = Accent),
                modifier = Modifier
                    .width(200.dp)
                    .height(48.dp),
            ) {
                if (state.isLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(24.dp),
                        color = OnDark,
                        strokeWidth = 2.dp,
                    )
                } else {
                    Text("Refresh")
                }
            }
        }
    }
}
