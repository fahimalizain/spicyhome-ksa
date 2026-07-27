package com.spicyhome.pos.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.spicyhome.pos.SpicyHomeApp
import com.spicyhome.pos.data.PreferencesManager
import com.spicyhome.pos.data.SessionManager
import com.spicyhome.pos.data.api.ApiClientProvider
import com.spicyhome.pos.ui.login.LoginScreen
import com.spicyhome.pos.ui.login.LoginViewModel
import com.spicyhome.pos.ui.order.OrderScreen
import com.spicyhome.pos.ui.order.OrderViewModel
import com.spicyhome.pos.ui.orders.OrdersScreen
import com.spicyhome.pos.ui.orders.OrdersViewModel
import com.spicyhome.pos.ui.tables.TablesScreen
import com.spicyhome.pos.ui.tables.TablesViewModel
import com.spicyhome.pos.ui.setup.SetupScreen
import com.spicyhome.pos.ui.setup.SetupViewModel

object NavRoutes {
    const val SETUP = "setup"
    const val LOGIN = "login"
    const val ORDER = "order"
    const val ORDERS = "orders"
    const val TABLES = "tables"
}

@Composable
fun NavGraph(
    preferencesManager: PreferencesManager,
    apiClientProvider: ApiClientProvider,
    sessionManager: SessionManager,
) {
    val navController = rememberNavController()
    val app = LocalContext.current.applicationContext as SpicyHomeApp

    LaunchedEffect(sessionManager) {
        sessionManager.unauthorized.collect {
            navController.navigate(NavRoutes.LOGIN) {
                popUpTo(0) { inclusive = true }
            }
        }
    }

    NavHost(
        navController = navController,
        startDestination = NavRoutes.SETUP,
    ) {
        composable(NavRoutes.SETUP) {
            val vm: SetupViewModel = viewModel(factory = SetupViewModel.Factory(preferencesManager, apiClientProvider))
            SetupScreen(
                viewModel = vm,
                onConnected = {
                    navController.navigate(NavRoutes.LOGIN) {
                        popUpTo(NavRoutes.SETUP) { inclusive = true }
                    }
                }
            )
        }

        composable(NavRoutes.LOGIN) {
            val vm: LoginViewModel = viewModel(factory = LoginViewModel.Factory(preferencesManager, apiClientProvider))
            LoginScreen(
                viewModel = vm,
                onLoginSuccess = {
                    navController.navigate(NavRoutes.ORDER) {
                        popUpTo(NavRoutes.LOGIN) { inclusive = true }
                    }
                },
                onLogout = {
                    navController.navigate(NavRoutes.SETUP) {
                        popUpTo(0) { inclusive = true }
                    }
                }
            )
        }

        composable(
            route = "order?tableId={tableId}&orderId={orderId}",
            arguments = listOf(
                navArgument("tableId") { type = NavType.StringType; nullable = true; defaultValue = null },
                navArgument("orderId") { type = NavType.StringType; nullable = true; defaultValue = null },
            ),
        ) { backStackEntry ->
            val args = backStackEntry.arguments
            val initialTableId: Long? = args?.getString("tableId")?.toLongOrNull()
            val initialOrderId: Long? = args?.getString("orderId")?.toLongOrNull()
            val vm: OrderViewModel = viewModel(factory = OrderViewModel.Factory(preferencesManager, apiClientProvider, app.realtimeClient, initialTableId, initialOrderId))
            OrderScreen(
                viewModel = vm,
                onViewOrders = { navController.navigate(NavRoutes.ORDERS) },
                onViewTables = { navController.navigate(NavRoutes.TABLES) },
                onLogout = {
                    navController.navigate(NavRoutes.LOGIN) {
                        popUpTo(0) { inclusive = true }
                    }
                }
            )
        }

        composable(NavRoutes.ORDERS) {
            val vm: OrdersViewModel = viewModel(factory = OrdersViewModel.Factory(preferencesManager, apiClientProvider, app.realtimeClient))
            OrdersScreen(
                viewModel = vm,
                onBack = { navController.popBackStack() },
                onContinue = { orderId ->
                    navController.navigate("order?orderId=$orderId") {
                        popUpTo("order?tableId={tableId}&orderId={orderId}") { inclusive = true }
                    }
                }
            )
        }

        composable(NavRoutes.TABLES) {
            val vm: TablesViewModel = viewModel(factory = TablesViewModel.Factory(preferencesManager, apiClientProvider, app.realtimeClient))
            TablesScreen(
                viewModel = vm,
                onBack = { navController.popBackStack() },
                onOpenTable = { tableId, orderId ->
                    val route = if (orderId != null) "order?tableId=$tableId&orderId=$orderId" else "order?tableId=$tableId"
                    navController.navigate(route) {
                        popUpTo("order?tableId={tableId}&orderId={orderId}") { inclusive = true }
                    }
                },
            )
        }
    }
}
