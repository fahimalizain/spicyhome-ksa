package com.spicyhome.pos.ui.navigation

import androidx.compose.runtime.Composable
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.spicyhome.pos.data.PreferencesManager
import com.spicyhome.pos.data.api.ApiClientProvider
import com.spicyhome.pos.ui.login.LoginScreen
import com.spicyhome.pos.ui.login.LoginViewModel
import com.spicyhome.pos.ui.order.OrderScreen
import com.spicyhome.pos.ui.order.OrderViewModel
import com.spicyhome.pos.ui.orders.OrdersScreen
import com.spicyhome.pos.ui.orders.OrdersViewModel
import com.spicyhome.pos.ui.setup.SetupScreen
import com.spicyhome.pos.ui.setup.SetupViewModel

object NavRoutes {
    const val SETUP = "setup"
    const val LOGIN = "login"
    const val ORDER = "order"
    const val ORDERS = "orders"
}

@Composable
fun NavGraph(
    preferencesManager: PreferencesManager,
    apiClientProvider: ApiClientProvider,
) {
    val navController = rememberNavController()

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

        composable(NavRoutes.ORDER) {
            val vm: OrderViewModel = viewModel(factory = OrderViewModel.Factory(preferencesManager, apiClientProvider))
            OrderScreen(
                viewModel = vm,
                onViewOrders = { navController.navigate(NavRoutes.ORDERS) },
                onLogout = {
                    navController.navigate(NavRoutes.SETUP) {
                        popUpTo(0) { inclusive = true }
                    }
                }
            )
        }

        composable(NavRoutes.ORDERS) {
            val vm: OrdersViewModel = viewModel(factory = OrdersViewModel.Factory(preferencesManager, apiClientProvider))
            OrdersScreen(
                viewModel = vm,
                onBack = { navController.popBackStack() }
            )
        }
    }
}
