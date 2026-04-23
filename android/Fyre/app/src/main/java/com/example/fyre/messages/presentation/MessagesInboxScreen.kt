package com.example.fyre.messages.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.fyre.messages.model.MessageThread
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun MessagesInboxScreen(
    threads: List<MessageThread>,
    onOpenThread: (String) -> Unit,
    isLoading: Boolean = false,
    errorMessage: String? = null
) {
    if (threads.isEmpty() && isLoading) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            Text(text = "Caricamento inbox...")
        }
        return
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        if (!errorMessage.isNullOrBlank()) {
            item(key = "messages_error") {
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 8.dp),
                    color = MaterialTheme.colorScheme.errorContainer,
                    shape = MaterialTheme.shapes.medium
                ) {
                    Text(
                        text = errorMessage,
                        color = MaterialTheme.colorScheme.onErrorContainer,
                        modifier = Modifier.padding(10.dp)
                    )
                }
            }
        }

        items(threads, key = { it.id }) { thread ->
            Surface(
                onClick = { onOpenThread(thread.id) },
                modifier = Modifier.fillMaxWidth(),
                tonalElevation = 1.dp,
                shape = MaterialTheme.shapes.medium
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    AvatarCircle(label = thread.avatarLabel)

                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = thread.displayName,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold
                        )
                        Text(
                            text = thread.lastMessage,
                            style = MaterialTheme.typography.bodyMedium,
                            maxLines = 1
                        )
                    }

                    Column(horizontalAlignment = Alignment.End) {
                        Text(
                            text = formatInboxTimestamp(thread.lastTimestamp),
                            style = MaterialTheme.typography.labelSmall
                        )
                        if (thread.unreadCount > 0) {
                            UnreadBadge(unreadCount = thread.unreadCount)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun AvatarCircle(label: String) {
    Box(
        modifier = Modifier
            .size(44.dp)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.primary),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = label,
            color = MaterialTheme.colorScheme.onPrimary,
            fontWeight = FontWeight.Bold
        )
    }
}

@Composable
private fun UnreadBadge(unreadCount: Int) {
    Box(
        modifier = Modifier
            .padding(top = 6.dp)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.primary)
            .padding(horizontal = 8.dp, vertical = 2.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = unreadCount.toString(),
            color = MaterialTheme.colorScheme.onPrimary,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold
        )
    }
}

private fun formatInboxTimestamp(timestamp: Long): String {
    val pattern = "dd/MM HH:mm"
    return SimpleDateFormat(pattern, Locale.ITALY).format(Date(timestamp))
}

