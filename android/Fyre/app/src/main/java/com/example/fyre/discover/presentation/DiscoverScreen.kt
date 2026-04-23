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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.fyre.R
import com.example.fyre.account.model.DiscoveryPreferences
import com.example.fyre.account.model.NotificationSettings
import com.example.fyre.core.notifications.NotificationChannels
import com.example.fyre.core.notifications.NotificationGateway
import com.example.fyre.discover.data.MockDiscoveryProfiles
import com.example.fyre.discover.data.MockMatchEngine
import com.example.fyre.discover.model.DiscoveryProfile
import kotlin.math.abs
import kotlin.math.sign
import kotlinx.coroutines.delay

@Composable
fun DiscoverScreen(
    profiles: List<DiscoveryProfile> = MockDiscoveryProfiles.items,
    discoveryPreferences: DiscoveryPreferences = DiscoveryPreferences(),
    notificationSettings: NotificationSettings = NotificationSettings(),
    notificationGateway: NotificationGateway? = null,
    onOpenThread: (String) -> Unit = {}
) {
    val context = LocalContext.current
    var currentIndex by rememberSaveable { mutableIntStateOf(0) }
    var dragOffsetX by remember { mutableFloatStateOf(0f) }
    var pendingDecision by remember { mutableStateOf<SwipeDecision?>(null) }
    var matchPayload by remember { mutableStateOf<MockMatchEngine.MatchPayload?>(null) }

    val filteredProfiles = profiles.filter { profile ->
        val ageOk = profile.age in discoveryPreferences.minAge..discoveryPreferences.maxAge
        val distanceOk = profile.distanceKm <= discoveryPreferences.maxDistanceKm
        val intentOk = discoveryPreferences.intent == "Tutti" ||
            profile.intent.equals(discoveryPreferences.intent, ignoreCase = true)
        val verifiedOk = !discoveryPreferences.showOnlyVerified || profile.isVerified
        ageOk && distanceOk && intentOk && verifiedOk
    }

    val currentProfile = filteredProfiles.getOrNull(currentIndex)
    val nextProfile = filteredProfiles.getOrNull(currentIndex + 1)
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

        currentIndex = (currentIndex + 1).coerceAtMost(filteredProfiles.size)
        dragOffsetX = 0f
        pendingDecision = null
    }

    LaunchedEffect(filteredProfiles.size) {
        if (currentIndex >= filteredProfiles.size) {
            currentIndex = 0
        }
    }

    LaunchedEffect(matchPayload?.threadId) {
        val payload = matchPayload ?: return@LaunchedEffect
        if (!notificationSettings.pushEnabled || !notificationSettings.matchNotifications) return@LaunchedEffect

        val matchedProfile = filteredProfiles.firstOrNull { it.id == payload.profileId }
        notificationGateway?.showLocalNotification(
            title = context.getString(R.string.account_switch_matches),
            body = matchedProfile?.let {
                context.getString(R.string.discover_match_notification_body, it.name)
            } ?: context.getString(R.string.discover_match_notification_fallback),
            channelId = NotificationChannels.MATCHES
        )
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
            text = stringResource(R.string.discover_title),
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.SemiBold
        )

        if (currentProfile == null) {
            EmptyDiscoveryState(hasActiveFilters = filteredProfiles.isEmpty() && profiles.isNotEmpty())
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
                        text = stringResource(R.string.discover_match_title),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = stringResource(R.string.discover_match_description),
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
                            Text(stringResource(R.string.discover_open_thread))
                        }
                        Button(onClick = { matchPayload = null }) {
                            Text(stringResource(R.string.discover_continue))
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
                    contentDescription = stringResource(R.string.discover_pass_profile_cd),
                    tint = MaterialTheme.colorScheme.error,
                    modifier = Modifier.size(34.dp)
                )
            }
            Text(
                text = stringResource(
                    R.string.discover_counter,
                    (currentIndex + 1).coerceAtMost(filteredProfiles.size.coerceAtLeast(1)),
                    filteredProfiles.size
                ),
                style = MaterialTheme.typography.labelLarge
            )
            IconButton(onClick = { triggerDecision(SwipeDecision.Like) }) {
                Icon(
                    imageVector = Icons.Filled.Favorite,
                    contentDescription = stringResource(R.string.discover_like_profile_cd),
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
                    text = stringResource(R.string.discover_profile_name_age, profile.name, profile.age),
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
                    text = stringResource(
                        R.string.discover_profile_city_distance,
                        profile.city,
                        profile.distanceKm
                    ),
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
                    text = stringResource(R.string.discover_intent, profile.intent),
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold
                )

                if (profile.isVerified) {
                    AssistChip(
                        onClick = { },
                        label = { Text(stringResource(R.string.discover_verified_chip), fontSize = 12.sp) }
                    )
                }

                Text(
                    text = stringResource(R.string.discover_interests),
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.SemiBold
                )
                TagList(tags = profile.interests)

                Text(
                    text = stringResource(R.string.discover_social_tags),
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
private fun EmptyDiscoveryState(hasActiveFilters: Boolean) {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = if (hasActiveFilters) {
                stringResource(R.string.discover_empty_filtered)
            } else {
                stringResource(R.string.discover_empty_exhausted)
            },
            style = MaterialTheme.typography.bodyLarge
        )
    }
}

