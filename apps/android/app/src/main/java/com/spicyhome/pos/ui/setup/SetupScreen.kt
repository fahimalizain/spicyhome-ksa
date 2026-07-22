package com.spicyhome.pos.ui.setup

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.spicyhome.pos.ui.theme.Accent

@Composable
fun SetupScreen(
    viewModel: SetupViewModel,
    onConnected: () -> Unit,
) {
    val state by viewModel.uiState.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(48.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = "SpicyHome POS",
            fontSize = 32.sp,
            color = MaterialTheme.colorScheme.onBackground,
        )

        Spacer(modifier = Modifier.height(8.dp))

        Text(
            text = "Connect to Server",
            fontSize = 18.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Spacer(modifier = Modifier.height(32.dp))

        OutlinedTextField(
            value = state.serverUrl,
            onValueChange = { viewModel.onServerUrlChange(it) },
            label = { Text("Server URL") },
            placeholder = { Text("http://192.168.1.50:3000") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(0.6f),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = Accent,
                focusedLabelColor = Accent,
                cursorColor = Accent,
            ),
        )

        Spacer(modifier = Modifier.height(16.dp))

        Row(
            horizontalArrangement = Arrangement.spacedBy(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Button(
                onClick = { viewModel.testConnection() },
                enabled = !state.isTesting && state.serverUrl.isNotBlank(),
                colors = ButtonDefaults.buttonColors(containerColor = Accent),
                modifier = Modifier.height(56.dp),
            ) {
                Text(
                    text = if (state.isTesting) "Testing..." else "Test Connection",
                    fontSize = 18.sp,
                )
            }

            Button(
                onClick = {
                    viewModel.saveAndConnect()
                    onConnected()
                },
                enabled = state.isConnected,
                colors = ButtonDefaults.buttonColors(containerColor = Accent),
                modifier = Modifier.height(56.dp),
            ) {
                Text(text = "Connect", fontSize = 18.sp)
            }
        }

        if (state.testResult != null) {
            Spacer(modifier = Modifier.height(16.dp))
            val result = state.testResult!!
            Text(
                text = result,
                color = if (state.isConnected)
                    MaterialTheme.colorScheme.primary
                else
                    MaterialTheme.colorScheme.error,
                fontSize = 16.sp,
            )
        }
    }
}
