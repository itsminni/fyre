package com.example.fyre.discover.presentation

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.FastRewind
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import com.example.fyre.R
import com.example.fyre.account.model.DiscoveryPreferences
import com.example.fyre.account.model.NotificationSettings
import com.example.fyre.core.notifications.NotificationChannels
import com.example.fyre.core.notifications.NotificationGateway
import com.example.fyre.core.notifications.RealtimeNotificationSeenStore
import com.example.fyre.data.AppGraphProvider
import com.example.fyre.discover.data.DiscoveryRepository
import com.example.fyre.discover.model.DiscoveryProfile
import coil.compose.AsyncImage
import kotlin.math.abs
import kotlin.math.sign
import kotlinx.coroutines.delay

@Composable
fun DiscoverScreen(
    discoveryPreferences: DiscoveryPreferences = DiscoveryPreferences(),
    notificationSettings: NotificationSettings = NotificationSettings(),
    notificationGateway: NotificationGateway? = null,
    onOpenThread: (String) -> Unit = {},
    repository: DiscoveryRepository? = null
) {
    val context = LocalContext.current
    val appGraph = remember(context.applicationContext) {
        AppGraphProvider.get(context.applicationContext)
    }
    val discoveryRepository = remember(repository, appGraph) {
        repository ?: appGraph.discoveryRepository
    }
    val notificationSeenStore = remember(context.applicationContext) {
        RealtimeNotificationSeenStore(context.applicationContext)
    }

    var profiles by remember { mutableStateOf<List<DiscoveryProfile>>(emptyList()) }
    var optimisticDismissedProfileIds by remember { mutableStateOf<Set<String>>(emptySet()) }
    var isLoading by remember { mutableStateOf(true) }
    var isSubmittingDecision by remember { mutableStateOf(false) }
    var globalError by remember { mutableStateOf<String?>(null) }

    var currentIndex by rememberSaveable { mutableIntStateOf(0) }
    var dragOffsetX by remember { mutableFloatStateOf(0f) }
    var dragOffsetY by remember { mutableFloatStateOf(0f) }
    var isDraggingCard by remember { mutableStateOf(false) }
    var pendingDecision by remember { mutableStateOf<PendingSwipeDecision?>(null) }
    var matchPayload by remember { mutableStateOf<MatchPayload?>(null) }
    var selectedDetailsProfile by remember { mutableStateOf<DiscoveryProfile?>(null) }
    val activePhotoIndices = remember { mutableStateMapOf<String, Int>() }

    LaunchedEffect(discoveryRepository) {
        isLoading = true
        globalError = null

        val result = discoveryRepository.loadProfiles()
        result.fold(
            onSuccess = { loadedProfiles ->
                optimisticDismissedProfileIds = emptySet()
                profiles = loadedProfiles
            },
            onFailure = { throwable ->
                profiles = emptyList()
                globalError = throwable.message ?: "Impossibile caricare i profili discovery"
            }
        )

        currentIndex = 0
        isLoading = false
    }

    val filteredProfiles = discoverProfilesForDisplay(
        profiles = profiles,
        discoveryPreferences = discoveryPreferences,
        dismissedProfileIds = optimisticDismissedProfileIds
    )

    val currentProfile = filteredProfiles.getOrNull(currentIndex)
    val nextProfile = filteredProfiles.getOrNull(currentIndex + 1)
    val swipeThreshold = 120f
    val detailsSwipeThreshold = 92f
    val cardMotionSpec = if (isDraggingCard) {
        snap<Float>()
    } else {
        tween(durationMillis = 160)
    }

    val animatedOffsetX by animateFloatAsState(
        targetValue = dragOffsetX,
        animationSpec = cardMotionSpec,
        label = "discover_card_offset"
    )
    val animatedRotation by animateFloatAsState(
        targetValue = (dragOffsetX / 45f).coerceIn(-15f, 15f),
        animationSpec = cardMotionSpec,
        label = "discover_card_rotation"
    )

    LaunchedEffect(pendingDecision) {
        val decision = pendingDecision ?: return@LaunchedEffect
        val profile = decision.profile

        isSubmittingDecision = true
        isDraggingCard = false
        dragOffsetX = if (decision.direction == SwipeDecision.Like) 950f else -950f
        delay(170)

        optimisticDismissedProfileIds = optimisticDismissedProfileIds + profile.id
        currentIndex = currentIndex.coerceAtMost((filteredProfiles.size - 2).coerceAtLeast(0))
        dragOffsetX = 0f
        dragOffsetY = 0f
        selectedDetailsProfile = null

        val decisionResult = discoveryRepository.submitDecision(
            profile = profile,
            liked = decision.direction == SwipeDecision.Like
        )

        decisionResult.fold(
            onSuccess = { outcome ->
                matchPayload = if (outcome.matched && !outcome.threadId.isNullOrBlank()) {
                    MatchPayload(
                        profileId = profile.id,
                        profileName = profile.name,
                        threadId = outcome.threadId,
                        isMatched = true
                    )
                } else {
                    null
                }
            },
            onFailure = { throwable ->
                optimisticDismissedProfileIds = optimisticDismissedProfileIds - profile.id
                currentIndex = currentIndex.coerceAtMost((filteredProfiles.size - 1).coerceAtLeast(0))
                globalError = throwable.message ?: "Impossibile sincronizzare lo swipe"
                matchPayload = null
            }
        )

        pendingDecision = null
        isSubmittingDecision = false
    }

    LaunchedEffect(filteredProfiles.size) {
        if (currentIndex >= filteredProfiles.size) {
            currentIndex = 0
        }
    }

    LaunchedEffect(matchPayload?.threadId) {
        val payload = matchPayload ?: return@LaunchedEffect
        if (!payload.isMatched) return@LaunchedEffect
        val shouldNotify = notificationSeenStore.markMatchSeen(payload.threadId)
        if (!shouldNotify) return@LaunchedEffect
        if (!notificationSettings.pushEnabled || !notificationSettings.matchNotifications) return@LaunchedEffect

        notificationGateway?.showLocalNotification(
            title = context.getString(R.string.account_switch_matches),
            body = context.getString(R.string.discover_match_notification_body, payload.profileName),
            channelId = NotificationChannels.MATCHES
        )
    }

    fun triggerDecision(decision: SwipeDecision) {
        if (pendingDecision != null || isSubmittingDecision || currentProfile == null) return
        pendingDecision = PendingSwipeDecision(profile = currentProfile, direction = decision)
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
    ) {
        when {
            isLoading -> {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = stringResource(R.string.nav_loading_session),
                        color = Color.White.copy(alpha = 0.86f)
                    )
                }
            }
            currentProfile == null -> {
                EmptyDiscoveryState(hasActiveFilters = filteredProfiles.isEmpty() && profiles.isNotEmpty())
            }
            else -> {
                if (nextProfile != null) {
                    DiscoveryCard(
                        profile = nextProfile,
                        discoveryPreferences = discoveryPreferences,
                        photoIndex = activePhotoIndices[nextProfile.id] ?: 0,
                        onShiftPhoto = { },
                        onOpenDetails = { },
                        modifier = Modifier
                            .fillMaxSize()
                            .graphicsLayer {
                                scaleX = 0.97f
                                scaleY = 0.97f
                                alpha = 0.55f
                            }
                    )
                }

                DiscoveryCard(
                    profile = currentProfile,
                    discoveryPreferences = discoveryPreferences,
                    photoIndex = activePhotoIndices[currentProfile.id] ?: 0,
                    onShiftPhoto = { delta ->
                        val lastIndex = currentProfile.photoUrls.lastIndex
                        if (lastIndex >= 0) {
                            val currentPhoto = activePhotoIndices[currentProfile.id] ?: 0
                            activePhotoIndices[currentProfile.id] = (currentPhoto + delta).coerceIn(0, lastIndex)
                        }
                    },
                    onOpenDetails = {
                        selectedDetailsProfile = currentProfile
                    },
                    modifier = Modifier
                        .fillMaxSize()
                        .graphicsLayer {
                            translationX = animatedOffsetX
                            rotationZ = animatedRotation
                        }
                        .pointerInput(currentProfile.id, pendingDecision, isSubmittingDecision) {
                            detectDragGestures(
                                onDrag = { change, dragAmount ->
                                    if (pendingDecision != null || isSubmittingDecision) return@detectDragGestures
                                    isDraggingCard = true
                                    change.consume()
                                    dragOffsetX += dragAmount.x
                                    dragOffsetY += dragAmount.y
                                },
                                onDragCancel = {
                                    isDraggingCard = false
                                    if (pendingDecision == null && !isSubmittingDecision) {
                                        dragOffsetX = 0f
                                        dragOffsetY = 0f
                                    }
                                },
                                onDragEnd = {
                                    isDraggingCard = false
                                    if (pendingDecision != null || isSubmittingDecision) return@detectDragGestures
                                    val horizontalDistance = abs(dragOffsetX)
                                    val verticalDistance = abs(dragOffsetY)
                                    if (verticalDistance > horizontalDistance && dragOffsetY <= -detailsSwipeThreshold) {
                                        selectedDetailsProfile = currentProfile
                                        dragOffsetX = 0f
                                        dragOffsetY = 0f
                                    } else if (horizontalDistance > verticalDistance && horizontalDistance >= swipeThreshold) {
                                        val decision = if (dragOffsetX.sign >= 0f) {
                                            SwipeDecision.Like
                                        } else {
                                            SwipeDecision.Skip
                                        }
                                        triggerDecision(decision)
                                    } else {
                                        dragOffsetX = 0f
                                        dragOffsetY = 0f
                                    }
                                }
                            )
                        }
                )

                DiscoverySwipeActions(
                    onSkip = { triggerDecision(SwipeDecision.Skip) },
                    onLike = { triggerDecision(SwipeDecision.Like) },
                    enabled = !isSubmittingDecision,
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .padding(bottom = 28.dp)
                        .zIndex(1f)
                )
            }
        }

        AnimatedVisibility(
            visible = globalError != null,
            modifier = Modifier
                .align(Alignment.TopCenter)
                .padding(16.dp)
                .zIndex(3f),
            enter = fadeIn(),
            exit = fadeOut()
        ) {
            Card(
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.errorContainer
                )
            ) {
                Text(
                    text = globalError.orEmpty(),
                    color = MaterialTheme.colorScheme.onErrorContainer,
                    modifier = Modifier.padding(12.dp)
                )
            }
        }

        AnimatedVisibility(
            visible = matchPayload != null,
            modifier = Modifier
                .align(Alignment.TopCenter)
                .padding(16.dp)
                .zIndex(2f),
            enter = slideInVertically(initialOffsetY = { -it }) + fadeIn(),
            exit = slideOutVertically(targetOffsetY = { -it }) + fadeOut()
        ) {
            ElevatedCard(modifier = Modifier.fillMaxWidth()) {
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
    }

    selectedDetailsProfile?.let { profile ->
        DiscoverProfileDetailsSheet(
            profile = profile,
            discoveryPreferences = discoveryPreferences,
            onDismiss = { selectedDetailsProfile = null }
        )
    }
}

private data class MatchPayload(
    val profileId: String,
    val profileName: String,
    val threadId: String,
    val isMatched: Boolean
)

private data class PendingSwipeDecision(
    val profile: DiscoveryProfile,
    val direction: SwipeDecision
)

private enum class SwipeDecision {
    Like,
    Skip
}

internal fun discoverProfilesForDisplay(
    profiles: List<DiscoveryProfile>,
    discoveryPreferences: DiscoveryPreferences,
    dismissedProfileIds: Set<String> = emptySet()
): List<DiscoveryProfile> {
    return profiles.filterNot { profile -> profile.id in dismissedProfileIds }
}

internal fun matchesIntentFilter(profileIntent: String, filter: String): Boolean {
    val normalizedFilter = normalizeIntent(filter)
    if (normalizedFilter == "all") return true
    return normalizeIntent(profileIntent) == normalizedFilter
}

internal fun normalizeIntent(value: String): String {
    val normalized = value.trim().lowercase().replace(Regex("[\\s_-]+"), "")
    return when {
        normalized.isBlank() || normalized == "tutti" || normalized == "all" -> "all"
        normalized == "relationship" || normalized.contains("relaz") -> "relationship"
        normalized == "casual" || normalized.contains("legger") -> "casual"
        normalized == "friendship" || normalized.contains("amic") -> "friendship"
        normalized == "notsure" || normalized.contains("nons") -> "notSure"
        else -> normalized
    }
}

@Composable
private fun DiscoveryCard(
    profile: DiscoveryProfile,
    discoveryPreferences: DiscoveryPreferences,
    photoIndex: Int,
    onShiftPhoto: (Int) -> Unit,
    onOpenDetails: () -> Unit,
    modifier: Modifier = Modifier
) {
    val safePhotoIndex = photoIndex.coerceIn(0, profile.photoUrls.lastIndex.coerceAtLeast(0))
    val activePhotoUrl = profile.photoUrls.getOrNull(safePhotoIndex)
    val profileTitle = if (discoveryPreferences.showAge) {
        stringResource(R.string.discover_profile_name_age, profile.name, profile.age)
    } else {
        stringResource(R.string.discover_profile_name, profile.name)
    }

    Box(
        modifier = modifier
            .background(discoveryPhotoFallbackBrush())
    ) {
        if (!activePhotoUrl.isNullOrBlank()) {
            AsyncImage(
                model = activePhotoUrl,
                contentDescription = profile.name,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize()
            )
        }

        Row(modifier = Modifier.fillMaxSize()) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxSize()
                    .clickable(enabled = profile.photoUrls.size > 1) { onShiftPhoto(-1) }
            )
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxSize()
                    .clickable(enabled = profile.photoUrls.size > 1) { onShiftPhoto(1) }
            )
        }

        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        listOf(
                            Color.Black.copy(alpha = 0.46f),
                            Color.Transparent,
                            Color.Transparent
                        ),
                        endY = 420f
                    )
                )
        )

        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        listOf(
                            Color.Transparent,
                            Color.Black.copy(alpha = 0.12f),
                            Color.Black.copy(alpha = 0.76f)
                        )
                    )
                )
        )

        if (profile.photoUrls.size > 1) {
            PhotoIndicator(
                count = profile.photoUrls.size,
                activeIndex = safePhotoIndex,
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .padding(top = 14.dp)
            )
        }

        Column(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
                .padding(start = 28.dp, end = 24.dp, bottom = 132.dp),
            verticalArrangement = Arrangement.spacedBy(9.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = profileTitle,
                    style = MaterialTheme.typography.headlineLarge.copy(
                        fontSize = 34.sp,
                        lineHeight = 38.sp,
                        shadow = discoveryTextShadow()
                    ),
                    color = Color.White,
                    fontWeight = FontWeight.ExtraBold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier
                        .weight(1f)
                )
                IconButton(
                    onClick = onOpenDetails,
                    modifier = Modifier
                        .size(48.dp)
                        .background(Color.Black.copy(alpha = 0.42f), CircleShape)
                ) {
                    Icon(
                        imageVector = Icons.Filled.ExpandMore,
                        contentDescription = stringResource(R.string.discover_details_open),
                        tint = Color.White,
                        modifier = Modifier.size(30.dp)
                    )
                }
            }

            if (profile.city.isNotBlank()) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Filled.LocationOn,
                        contentDescription = null,
                        tint = Color.White.copy(alpha = 0.92f),
                        modifier = Modifier.size(19.dp)
                    )
                    Text(
                        text = stringResource(R.string.discover_profile_city, profile.city),
                        style = MaterialTheme.typography.titleSmall.copy(
                            shadow = discoveryTextShadow()
                        ),
                        color = Color.White.copy(alpha = 0.94f),
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                DiscoveryGlassChip(
                    text = "${profile.compatibilityScore}%",
                    containerColor = Color(0xFFFF9F35).copy(alpha = 0.82f),
                    contentColor = Color.White
                )
                if (discoveryPreferences.showDistance && profile.distanceKm > 0) {
                    DiscoveryGlassChip(
                        text = "${profile.distanceKm} km",
                        containerColor = Color.Black.copy(alpha = 0.44f),
                        contentColor = Color.White.copy(alpha = 0.92f)
                    )
                }
            }
        }
    }
}

@Composable
private fun DiscoverySwipeActions(
    onSkip: () -> Unit,
    onLike: () -> Unit,
    enabled: Boolean,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(20.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        IconButton(
            onClick = onSkip,
            enabled = enabled,
            modifier = Modifier
                .size(58.dp)
                .background(Color.Black.copy(alpha = 0.42f), CircleShape)
                .graphicsLayer {
                    alpha = if (enabled) 1f else 0.55f
                }
        ) {
            Icon(
                imageVector = Icons.Filled.FastRewind,
                contentDescription = stringResource(R.string.discover_pass_profile_cd),
                tint = Color.White,
                modifier = Modifier.size(30.dp)
            )
        }
        IconButton(
            onClick = onLike,
            enabled = enabled,
            modifier = Modifier
                .size(58.dp)
                .background(
                    Brush.linearGradient(
                        listOf(
                            Color(0xFFFFB23E),
                            Color(0xFFFF821F)
                        )
                    ),
                    CircleShape
                )
                .graphicsLayer {
                    alpha = if (enabled) 1f else 0.55f
                }
        ) {
            Icon(
                imageVector = Icons.Filled.LocalFireDepartment,
                contentDescription = stringResource(R.string.discover_like_profile_cd),
                tint = Color.White,
                modifier = Modifier.size(31.dp)
            )
        }
    }
}

@Composable
private fun DiscoveryGlassChip(
    text: String,
    containerColor: Color,
    contentColor: Color,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .background(containerColor, CircleShape)
            .padding(horizontal = 10.dp, vertical = 5.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelMedium.copy(
                shadow = discoveryTextShadow()
            ),
            color = contentColor,
            fontWeight = FontWeight.Bold,
            fontSize = 12.sp,
            maxLines = 1
        )
    }
}

private fun discoveryTextShadow(): Shadow {
    return Shadow(
        color = Color.Black.copy(alpha = 0.68f),
        offset = Offset(0f, 2f),
        blurRadius = 8f
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DiscoverProfileDetailsSheet(
    profile: DiscoveryProfile,
    discoveryPreferences: DiscoveryPreferences,
    onDismiss: () -> Unit
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp)
                .padding(bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp)
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    text = if (discoveryPreferences.showAge) {
                        stringResource(R.string.discover_profile_name_age, profile.name, profile.age)
                    } else {
                        stringResource(R.string.discover_profile_name, profile.name)
                    },
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold
                )
                if (profile.city.isNotBlank()) {
                    Text(
                        text = if (discoveryPreferences.showDistance && profile.distanceKm > 0) {
                            stringResource(R.string.discover_profile_city_distance, profile.city, profile.distanceKm)
                        } else {
                            stringResource(R.string.discover_profile_city, profile.city)
                        },
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            DetailsSection(title = stringResource(R.string.discover_details_info)) {
                DetailsRow(label = stringResource(R.string.profile_gender), value = genderLabel(profile.gender))
                DetailsRow(label = stringResource(R.string.profile_orientation), value = orientationLabel(profile.orientation))
                DetailsRow(label = stringResource(R.string.profile_intent), value = intentLabel(profile.intent))
                DetailsRow(label = stringResource(R.string.profile_smokes), value = yesNoLabel(profile.smokes))
                DetailsRow(label = stringResource(R.string.profile_drinks), value = yesNoLabel(profile.drinks))
            }

            if (profile.bio.isNotBlank()) {
                DetailsSection(title = stringResource(R.string.discover_details_bio)) {
                    Text(text = profile.bio, style = MaterialTheme.typography.bodyMedium)
                }
            }

            if (discoveryPreferences.showInterests && profile.interests.isNotEmpty()) {
                DetailsSection(title = stringResource(R.string.discover_interests)) {
                    TagList(tags = profile.interests)
                }
            }

            val visibleSocialTags = profile.socialTags.filter { tag ->
                when {
                    tag.startsWith("@") -> discoveryPreferences.showInstagramTag
                    tag.contains("spotify", ignoreCase = true) -> discoveryPreferences.showSpotifyTag
                    else -> discoveryPreferences.showInstagramTag || discoveryPreferences.showSpotifyTag
                }
            }
            if (visibleSocialTags.isNotEmpty()) {
                DetailsSection(title = stringResource(R.string.discover_social_tags)) {
                    TagList(tags = visibleSocialTags)
                }
            }
        }
    }
}

@Composable
private fun DetailsSection(
    title: String,
    content: @Composable ColumnScope.() -> Unit
) {
    Card(
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.42f)
        ),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold
            )
            content()
        }
    }
}

@Composable
private fun DetailsRow(label: String, value: String?) {
    if (value.isNullOrBlank()) return

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.weight(1f)
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.SemiBold
        )
    }
}

@Composable
private fun genderLabel(value: String?): String? {
    return when (value.normalizedToken()) {
        "male" -> stringResource(R.string.profile_gender_male)
        "female" -> stringResource(R.string.profile_gender_female)
        "nonbinary" -> stringResource(R.string.profile_gender_non_binary)
        "other" -> stringResource(R.string.profile_gender_other)
        else -> value?.trim()?.takeIf { it.isNotBlank() }
    }
}

@Composable
private fun orientationLabel(value: String?): String? {
    return when (value.normalizedToken()) {
        "straight" -> stringResource(R.string.profile_orientation_straight)
        "gay" -> stringResource(R.string.profile_orientation_gay)
        "lesbian" -> stringResource(R.string.profile_orientation_lesbian)
        "bisexual" -> stringResource(R.string.profile_orientation_bisexual)
        "pansexual" -> stringResource(R.string.profile_orientation_pansexual)
        "other" -> stringResource(R.string.profile_orientation_other)
        else -> value?.trim()?.takeIf { it.isNotBlank() }
    }
}

@Composable
private fun intentLabel(value: String?): String? {
    return when (normalizeIntent(value.orEmpty())) {
        "relationship" -> stringResource(R.string.profile_intent_relationship)
        "casual" -> stringResource(R.string.profile_intent_casual)
        "friendship" -> stringResource(R.string.profile_intent_friendship)
        "notSure" -> stringResource(R.string.profile_intent_not_sure)
        else -> value?.trim()?.takeIf { it.isNotBlank() }
    }
}

@Composable
private fun yesNoLabel(value: Boolean?): String? {
    return when (value) {
        true -> stringResource(R.string.discover_details_yes)
        false -> stringResource(R.string.discover_details_no)
        null -> null
    }
}

private fun String?.normalizedToken(): String? {
    val trimmed = this?.trim().orEmpty()
    if (trimmed.isBlank()) return null
    return trimmed.lowercase().replace(Regex("[\\s_-]+"), "")
}

@Composable
private fun PhotoIndicator(
    count: Int,
    activeIndex: Int,
    modifier: Modifier = Modifier
) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
        modifier = modifier
    ) {
        repeat(count) { index ->
            Box(
                modifier = Modifier
                    .size(if (index == activeIndex) 7.dp else 5.dp)
                    .background(
                        color = Color.White.copy(alpha = if (index == activeIndex) 0.95f else 0.42f),
                        shape = CircleShape
                    )
            )
        }
    }
}

@Composable
private fun discoveryPhotoFallbackBrush(): Brush {
    return Brush.linearGradient(
        listOf(
            MaterialTheme.colorScheme.primary.copy(alpha = 0.85f),
            MaterialTheme.colorScheme.secondary.copy(alpha = 0.72f),
            MaterialTheme.colorScheme.tertiary.copy(alpha = 0.62f)
        )
    )
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
            style = MaterialTheme.typography.bodyLarge,
            color = Color.White.copy(alpha = 0.86f),
            modifier = Modifier.padding(24.dp)
        )
    }
}
