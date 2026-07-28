package com.spicyhome.pos.ui.day

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.spicyhome.pos.ui.theme.*

@Composable
fun DayNotOpenScreen(
    viewModel: DayNotOpenViewModel,
    onDayOpen: () -> Unit,
    onLogout: () -> Unit,
) {
    val state by viewModel.uiState.collectAsState()

    LaunchedEffect(state.dayOpen) {
        if (state.dayOpen) {
            onDayOpen()
        }
    }

    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        when {
            !state.checkDone || state.dayOpen -> {
                CircularProgressIndicator(
                    modifier = Modifier.size(48.dp),
                    color = Accent,
                    strokeWidth = 4.dp,
                )
            }
            else -> {
                Column(
                    modifier = Modifier
                        .padding(32.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    Text(
                        text = "No Open Business Day",
                        fontSize = 24.sp,
                        fontWeight = FontWeight.Bold,
                        color = OnDark,
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                        text = "Open the business day on the POS terminal before taking orders.",
                        fontSize = 16.sp,
                        color = OnDarkSecondary,
                        textAlign = TextAlign.Center,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "The Android tablet cannot open or close business days.",
                        fontSize = 14.sp,
                        color = OnDarkSecondary,
                        textAlign = TextAlign.Center,
                    )
                    Spacer(modifier = Modifier.height(32.dp))

                    if (state.error != null) {
                        Text(
                            text = state.error!!,
                            color = Error,
                            fontSize = 14.sp,
                            textAlign = TextAlign.Center,
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                    }

                    Button(
                        onClick = { viewModel.checkDay() },
                        enabled = !state.isLoading,
                        colors = ButtonDefaults.buttonColors(containerColor = Accent),
                        modifier = Modifier
                            .width(200.dp)
                            .height(56.dp),
                    ) {
                        if (state.isLoading) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(24.dp),
                                color = OnDark,
                                strokeWidth = 2.dp,
                            )
                        } else {
                            Text(
                                text = "Refresh",
                                fontSize = 18.sp,
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    TextButton(onClick = { viewModel.logout(); onLogout() }) {
                        Text(
                            text = "Logout",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}
