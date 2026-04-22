package com.example.fyre.discover.presentation

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.fyre.discover.data.MockDiscoveryProfiles
import com.example.fyre.discover.data.MockMatchEngine
import com.example.fyre.discover.model.DiscoveryProfile
import kotlin.math.abs
import kotlin.math.sign
import kotlinx.coroutines.delay

@Composable
fun DiscoverScreen(
    profiles: List<DiscoveryProfile> = MockDiscoveryProfiles.items,
    onOpenThread: (String) -> Unit = {}
) {
    var currentIndex by rememberSaveable { mutableIntStateOf(0) }
    var dragOffsetX by remember { mutableFloatStateOf(0f) }
    var pendingDecision by remember { mutableStateOf<SwipeDecision?>(null) }
    var matchPayload by remember { mutableStateOf<MockMatchEngine.MatchPayload?>(null) }

    val currentProfile = profiles.getOrNull(currentIndex)
    val nextProfile = profiles.getOrNull(currentIndex + 1)
    val swipeThreshold = 160f

    val animatedOffsetX by animateFloatAsState(
        targetValue = dragOffsetX,
        label = "discover_card_offset"
    )
    val animatedRotation by animateFloatAsState(
        targetValue = (dragOffsetX / 45f).coerceIn(-15f, 15f),
        label = "discover_card_rotation"
    )

    LaunchedEffect(pendingDecision, currentProfile?.id) {
        val decision = pendingDecision ?: return@LaunchedEffect
        val profile = currentProfile ?: return@LaunchedEffect

        dragOffsetX = if (decision == SwipeDecision.Like) 950f else -950f
        delay(190)

        if (decision == SwipeDecision.Like) {
            matchPayload = MockMatchEngine.evaluateLike(profile)
        }

        currentIndex = (currentIndex + 1).coerceAtMost(profiles.size)
        dragOffsetX = 0f
        pendingDecision = null
    }

    fun triggerDecision(decision: SwipeDecision) {
        if (pendingDecision != null || currentProfile == null) return
        pendingDecision = decision
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text(
            text = "Discovery",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.SemiBold
        )

        if (currentProfile == null) {
            EmptyDiscoveryState()
            return@Column
        }

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
            contentAlignment = Alignment.Center
        ) {
            if (nextProfile != null) {
                DiscoveryCard(
                    profile = nextProfile,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 16.dp)
                        .graphicsLayer {
                            scaleX = 0.96f
                            scaleY = 0.96f
                            alpha = 0.55f
                        }
                )
            }

            DiscoveryCard(
                profile = currentProfile,
                modifier = Modifier
                    .fillMaxWidth()
                    .graphicsLayer {
                        translationX = animatedOffsetX
                        rotationZ = animatedRotation
                    }
                    .pointerInput(currentProfile.id, pendingDecision) {
                        detectDragGestures(
                            onDrag = { change, dragAmount ->
                                if (pendingDecision != null) return@detectDragGestures
                                change.consume()
                                dragOffsetX += dragAmount.x
                            },
                            onDragCancel = {
                                if (pendingDecision == null) dragOffsetX = 0f
                            },
                            onDragEnd = {
                                if (pendingDecision != null) return@detectDragGestures
                                if (abs(dragOffsetX) >= swipeThreshold) {
                                    val decision = if (dragOffsetX.sign >= 0f) {
                                        SwipeDecision.Like
                                    } else {
                                        SwipeDecision.Skip
                                    }
                                    triggerDecision(decision)
                                } else {
                                    dragOffsetX = 0f
                                }
                            }
                        )
                    }
            )
        }

        AnimatedVisibility(
            visible = matchPayload != null,
            enter = slideInVertically(initialOffsetY = { -it }) + fadeIn(),
            exit = slideOutVertically(targetOffsetY = { -it }) + fadeOut()
        ) {
            ElevatedCard {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Text(
                        text = "It is a match!",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = "Match reciproco simulato in locale. Puoi gia aprire il thread mock.",
                        style = MaterialTheme.typography.bodyMedium
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Button(
                            onClick = {
                                val payload = matchPayload ?: return@Button
                                onOpenThread(payload.threadId)
                                matchPayload = null
                            }
                        ) {
                            Text("Apri thread")
                        }
                        Button(onClick = { matchPayload = null }) {
                            Text("Continua")
                        }
                    }
                }
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(onClick = { triggerDecision(SwipeDecision.Skip) }) {
                Icon(
                    imageVector = Icons.Filled.Close,
                    contentDescription = "Passa profilo",
                    tint = MaterialTheme.colorScheme.error,
                    modifier = Modifier.size(34.dp)
                )
            }
            Text(
                text = "${currentIndex + 1}/${profiles.size}",
                style = MaterialTheme.typography.labelLarge
            )
            IconButton(onClick = { triggerDecision(SwipeDecision.Like) }) {
                Icon(
                    imageVector = Icons.Filled.Favorite,
                    contentDescription = "Mi piace",
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(34.dp)
                )
            }
        }
    }
}

private enum class SwipeDecision {
    Like,
    Skip
}

@Composable
private fun DiscoveryCard(
    profile: DiscoveryProfile,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(24.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(190.dp)
                    .background(
                        brush = Brush.linearGradient(
                            listOf(
                                MaterialTheme.colorScheme.primary.copy(alpha = 0.85f),
                                MaterialTheme.colorScheme.secondary.copy(alpha = 0.75f)
                            )
                        )
                    )
                    .padding(16.dp),
                contentAlignment = Alignment.BottomStart
            ) {
                Text(
                    text = "${profile.name}, ${profile.age}",
                    style = MaterialTheme.typography.headlineSmall,
                    color = MaterialTheme.colorScheme.onPrimary,
                    fontWeight = FontWeight.Bold
                )
            }

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text(
                    text = "${profile.city} - ${profile.distanceKm} km",
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium
                )

                Text(
                    text = profile.bio,
                    style = MaterialTheme.typography.bodyMedium,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis
                )

                Text(
                    text = "Intent: ${profile.intent}",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold
                )

                Text(
                    text = "Interessi",
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.SemiBold
                )
                TagList(tags = profile.interests)

                Text(
                    text = "Tag social",
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.SemiBold
                )
                TagList(tags = profile.socialTags)
            }
        }
    }
}

@Composable
private fun TagList(tags: List<String>) {
    LazyRow(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        contentPadding = PaddingValues(end = 8.dp)
    ) {
        items(tags) { tag ->
            AssistChip(
                onClick = { },
                label = { Text(text = tag, fontSize = 12.sp) }
            )
        }
    }
}

@Composable
private fun EmptyDiscoveryState() {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = "Hai finito i profili disponibili. Torna piu tardi.",
            style = MaterialTheme.typography.bodyLarge
        )
    }
}

