package com.example.fyre.core.ui.components

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/**
 * Campo di testo personalizzato con lo stile Fyre.
 *
 * OutlinedTextField Material 3 con angoli arrotondati e colori del tema.
 * Supporta etichetta, placeholder, icona iniziale e messaggio di errore.
 *
 * @param value Valore corrente del campo
 * @param onValueChange Callback eseguita quando il valore cambia
 * @param label Etichetta del campo
 * @param modifier Modifier opzionale
 * @param placeholder Testo placeholder opzionale
 * @param leadingIcon Icona a sinistra opzionale (composable)
 * @param singleLine Se il campo accetta solo una riga
 * @param isError Se il campo è in stato di errore
 * @param supportingText Testo di supporto/errore sotto il campo
 */
@Composable
fun FyreTextField(
	value: String,
	onValueChange: (String) -> Unit,
	label: String,
	modifier: Modifier = Modifier,
	placeholder: String = "",
	leadingIcon: @Composable (() -> Unit)? = null,
	singleLine: Boolean = true,
	isError: Boolean = false,
	supportingText: String? = null
) {
	OutlinedTextField(
		value = value,
		onValueChange = onValueChange,
		label = { Text(label) },
		placeholder = if (placeholder.isNotEmpty()) {
			{ Text(placeholder) }
		} else null,
		leadingIcon = leadingIcon,
		modifier = modifier.fillMaxWidth(),
		singleLine = singleLine,
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

