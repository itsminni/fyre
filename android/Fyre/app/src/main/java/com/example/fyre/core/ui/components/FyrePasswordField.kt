package com.example.fyre.core.ui.components

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp

/**
 * Campo password personalizzato con lo stile Fyre.
 */
@Composable
fun FyrePasswordField(
	value: String,
	onValueChange: (String) -> Unit,
	label: String,
	modifier: Modifier = Modifier,
	leadingIcon: @Composable (() -> Unit)? = null,
	isError: Boolean = false,
	supportingText: String? = null
) {
	var passwordVisible by rememberSaveable { mutableStateOf(false) }

	OutlinedTextField(
		value = value,
		onValueChange = onValueChange,
		label = { Text(label) },
		leadingIcon = leadingIcon,
		modifier = modifier.fillMaxWidth(),
		singleLine = true,
		isError = isError,
		supportingText = if (supportingText != null) {
			{
				Text(
					text = supportingText,
					color = if (isError) {
						MaterialTheme.colorScheme.error
					} else {
						MaterialTheme.colorScheme.onSurfaceVariant
					}
				)
			}
		} else null,
		visualTransformation = if (passwordVisible) {
			VisualTransformation.None
		} else {
			PasswordVisualTransformation()
		},
		trailingIcon = {
			IconButton(onClick = { passwordVisible = !passwordVisible }) {
				Icon(
					imageVector = if (passwordVisible) {
						Icons.Filled.VisibilityOff
					} else {
						Icons.Filled.Visibility
					},
					contentDescription = if (passwordVisible) {
						"Nascondi password"
					} else {
						"Mostra password"
					},
					tint = MaterialTheme.colorScheme.onSurfaceVariant
				)
			}
		},
		shape = RoundedCornerShape(16.dp),
		colors = OutlinedTextFieldDefaults.colors(
			focusedBorderColor = MaterialTheme.colorScheme.primary,
			unfocusedBorderColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.5f),
			focusedLabelColor = MaterialTheme.colorScheme.primary,
			unfocusedLabelColor = MaterialTheme.colorScheme.onSurfaceVariant,
			cursorColor = MaterialTheme.colorScheme.primary
		)
	)
}

