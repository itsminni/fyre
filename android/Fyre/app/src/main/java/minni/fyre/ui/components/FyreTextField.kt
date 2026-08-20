package minni.fyre.ui.components

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

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
            focusedTextColor = RegistrationFieldText,
            unfocusedTextColor = RegistrationFieldText,
            errorTextColor = RegistrationFieldText,
            focusedContainerColor = Color.White,
            unfocusedContainerColor = Color.White,
            errorContainerColor = Color.White,

            focusedBorderColor = MaterialTheme.colorScheme.primary,
            unfocusedBorderColor = RegistrationFieldBorder,

            focusedLabelColor = MaterialTheme.colorScheme.primary,
            unfocusedLabelColor = RegistrationFieldLabel,
            focusedPlaceholderColor = RegistrationFieldLabel,
            unfocusedPlaceholderColor = RegistrationFieldLabel,
            focusedSupportingTextColor = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.92f),
            unfocusedSupportingTextColor = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.92f),

            cursorColor = MaterialTheme.colorScheme.primary
        )
    )
}

private val RegistrationFieldText = Color(0xFF6F6877)
private val RegistrationFieldLabel = Color(0xFFA8A1B0)
private val RegistrationFieldBorder = Color(0xFF8D8797)

