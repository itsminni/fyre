package com.example.fyre.discover.presentation

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.core.animateFloatAsState
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
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Favorite
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
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
import com.example.fyre.data.AppGraphProvider
import com.example.fyre.discover.data.DiscoveryRepository
import com.example.fyre.discover.data.SwipeOutcome
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

    var profiles by remember { mutableStateOf<List<DiscoveryProfile>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var isSubmittingDecision by remember { mutableStateOf(false) }
    var globalError by remember { mutableStateOf<String?>(null) }

    var currentIndex by rememberSaveable { mutableIntStateOf(0) }
    var dragOffsetX by remember { mutableFloatStateOf(0f) }
    var dragOffsetY by remember { mutableFloatStateOf(0f) }
    var pendingDecision by remember { mutableStateOf<SwipeDecision?>(null) }
    var matchPayload by remember { mutableStateOf<MatchPayload?>(null) }
    var selectedDetailsProfile by remember { mutableStateOf<DiscoveryProfile?>(null) }
    val activePhotoIndices = remember { mutableStateMapOf<String, Int>() }

    LaunchedEffect(discoveryRepository) {
        isLoading = true
        globalError = null

        val result = discoveryRepository.loadProfiles()
        result.fold(
            onSuccess = { loadedProfiles ->
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

    val filteredProfiles = discoverProfilesForDisplay(profiles, discoveryPreferences)

    val currentProfile = filteredProfiles.getOrNull(currentIndex)
    val nextProfile = filteredProfiles.getOrNull(currentIndex + 1)
    val swipeThreshold = 160f
    val detailsSwipeThreshold = 92f

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

        isSubmittingDecision = true
        dragOffsetX = if (decision == SwipeDecision.Like) 950f else -950f
        delay(190)

        val decisionResult = discoveryRepository.submitDecision(
            profile = profile,
            liked = decision == SwipeDecision.Like
        )

        decisionResult.fold(
            onSuccess = { outcome ->
                matchPayload = if (outcome.matched && !outcome.threadId.isNullOrBlank()) {
                    MatchPayload(profileId = profile.id, threadId = outcome.threadId)
                } else {
                    null
                }
            },
            onFailure = { throwable ->
                globalError = throwable.message ?: "Impossibile sincronizzare lo swipe"
                matchPayload = null
            }
        )

        currentIndex = (currentIndex + 1).coerceAtMost(filteredProfiles.size)
        dragOffsetX = 0f
        dragOffsetY = 0f
        pendingDecision = null
        selectedDetailsProfile = null
        isSubmittingDecision = false
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
        if (pendingDecision != null || isSubmittingDecision || currentProfile == null) return
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

        if (globalError != null) {
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

        if (isLoading) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                Text(text = stringResource(R.string.nav_loading_session))
            }
            return@Column
        }

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
                    discoveryPreferences = discoveryPreferences,
                    photoIndex = activePhotoIndices[nextProfile.id] ?: 0,
                    detailsExpanded = false,
                    onShiftPhoto = { },
                    onOpenDetails = { },
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
                discoveryPreferences = discoveryPreferences,
                photoIndex = activePhotoIndices[currentProfile.id] ?: 0,
                detailsExpanded = false,
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
                    .fillMaxWidth()
                    .graphicsLayer {
                        translationX = animatedOffsetX
                        rotationZ = animatedRotation
                    }
                    .pointerInput(currentProfile.id, pendingDecision, isSubmittingDecision) {
                        detectDragGestures(
                            onDrag = { change, dragAmount ->
                                if (pendingDecision != null || isSubmittingDecision) return@detectDragGestures
                                change.consume()
                                dragOffsetX += dragAmount.x
                                dragOffsetY += dragAmount.y
                            },
                            onDragCancel = {
                                if (pendingDecision == null && !isSubmittingDecision) {
                                    dragOffsetX = 0f
                                    dragOffsetY = 0f
                                }
                            },
                            onDragEnd = {
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
            IconButton(
                onClick = { triggerDecision(SwipeDecision.Skip) },
                enabled = !isSubmittingDecision
            ) {
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
            IconButton(
                onClick = { triggerDecision(SwipeDecision.Like) },
                enabled = !isSubmittingDecision
            ) {
                Icon(
                    imageVector = Icons.Filled.Favorite,
                    contentDescription = stringResource(R.string.discover_like_profile_cd),
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(34.dp)
                )
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
    val threadId: String
)

private enum class SwipeDecision {
    Like,
    Skip
}

internal fun discoverProfilesForDisplay(
    profiles: List<DiscoveryProfile>,
    discoveryPreferences: DiscoveryPreferences
): List<DiscoveryProfile> {
    val filtered = profiles.filter { profile ->
        val verifiedAllowed = !discoveryPreferences.showOnlyVerified || profile.isVerified
        val ageAllowed = profile.age in discoveryPreferences.minAge..discoveryPreferences.maxAge
        val distanceAllowed = profile.distanceKm <= 0 || profile.distanceKm <= discoveryPreferences.maxDistanceKm
        val intentAllowed = matchesIntentFilter(profile.intent, discoveryPreferences.intent)

        verifiedAllowed && ageAllowed && distanceAllowed && intentAllowed
    }

    return filtered.ifEmpty { profiles }
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
    detailsExpanded: Boolean,
    onShiftPhoto: (Int) -> Unit,
    onOpenDetails: () -> Unit,
    modifier: Modifier = Modifier
) {
    val safePhotoIndex = photoIndex.coerceIn(0, profile.photoUrls.lastIndex.coerceAtLeast(0))
    val activePhotoUrl = profile.photoUrls.getOrNull(safePhotoIndex)
    val visibleSocialTags = profile.socialTags.filter { tag ->
        when {
            tag.startsWith("@") -> discoveryPreferences.showInstagramTag
            tag.contains("spotify", ignoreCase = true) -> discoveryPreferences.showSpotifyTag
            else -> discoveryPreferences.showInstagramTag || discoveryPreferences.showSpotifyTag
        }
    }

    Card(
        modifier = modifier,
        shape = RoundedCornerShape(24.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(if (detailsExpanded) 280.dp else 360.dp)
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
                                    androidx.compose.ui.graphics.Color.Transparent,
                                    androidx.compose.ui.graphics.Color.Black.copy(alpha = 0.18f),
                                    androidx.compose.ui.graphics.Color.Black.copy(alpha = 0.76f)
                                )
                            )
                        )
                )

                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(16.dp),
                    verticalArrangement = Arrangement.SpaceBetween
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        if (profile.photoUrls.size > 1) {
                            PhotoIndicator(count = profile.photoUrls.size, activeIndex = safePhotoIndex)
                        }
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.End
                        ) {
                            AssistChip(
                                onClick = { },
                                label = {
                                    Text(
                                        text = stringResource(
                                            R.string.discover_compatibility,
                                            profile.compatibilityScore
                                        )
                                    )
                                }
                            )
                        }
                    }

                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text(
                            text = if (discoveryPreferences.showAge) {
                                stringResource(R.string.discover_profile_name_age, profile.name, profile.age)
                            } else {
                                stringResource(R.string.discover_profile_name, profile.name)
                            },
                            style = MaterialTheme.typography.headlineMedium,
                            color = androidx.compose.ui.graphics.Color.White,
                            fontWeight = FontWeight.Bold,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis
                        )
                        if (profile.city.isNotBlank()) {
                            Text(
                                text = if (discoveryPreferences.showDistance) {
                                    stringResource(
                                        R.string.discover_profile_city_distance,
                                        profile.city,
                                        profile.distanceKm
                                    )
                                } else {
                                    stringResource(R.string.discover_profile_city, profile.city)
                                },
                                color = androidx.compose.ui.graphics.Color.White.copy(alpha = 0.90f),
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.Medium
                            )
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            if (profile.isVerified) {
                                AssistChip(
                                    onClick = { },
                                    label = { Text(stringResource(R.string.discover_verified_chip), fontSize = 12.sp) }
                                )
                            }
                            if (profile.photoUrls.size > 1) {
                                AssistChip(
                                    onClick = { },
                                    label = {
                                        Text(
                                            stringResource(
                                                R.string.discover_photo_counter,
                                                safePhotoIndex + 1,
                                                profile.photoUrls.size
                                            ),
                                            fontSize = 12.sp
                                        )
                                    }
                                )
                            }
                        }
                    }
                }
            }

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Button(onClick = onOpenDetails, modifier = Modifier.fillMaxWidth()) {
                    Text(
                        if (detailsExpanded) {
                            stringResource(R.string.discover_details_close)
                        } else {
                            stringResource(R.string.discover_details_open)
                        }
                    )
                }

                if (detailsExpanded) {
                    Text(
                        text = stringResource(R.string.discover_details_title),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold
                    )

                    if (profile.bio.isNotBlank()) {
                        Text(
                            text = stringResource(R.string.discover_details_bio),
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.SemiBold
                        )
                        Text(
                            text = profile.bio,
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }

                    val detailPills = buildList {
                        if (discoveryPreferences.showIntent && profile.intent.isNotBlank()) {
                            add(profile.intent)
                        }
                        profile.smokes?.let { add(if (it) "Fumo: si" else "Fumo: no") }
                        profile.drinks?.let { add(if (it) "Beve: si" else "Beve: no") }
                    }
                    if (detailPills.isNotEmpty()) {
                        TagList(tags = detailPills)
                    }

                    if (discoveryPreferences.showInterests && profile.interests.isNotEmpty()) {
                        Text(
                            text = stringResource(R.string.discover_interests),
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.SemiBold
                        )
                        TagList(tags = profile.interests)
                    }

                    if (visibleSocialTags.isNotEmpty()) {
                        Text(
                            text = stringResource(R.string.discover_social_tags),
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.SemiBold
                        )
                        TagList(tags = visibleSocialTags)
                    }
                } else {
                    Text(
                        text = profile.bio,
                        style = MaterialTheme.typography.bodyMedium,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )

                    if (discoveryPreferences.showIntent) {
                        Text(
                            text = stringResource(R.string.discover_intent, profile.intent),
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.SemiBold
                        )
                    }

                    if (discoveryPreferences.showInterests) {
                        TagList(tags = profile.interests.take(4))
                    }
                }
            }
        }
    }
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
private fun PhotoIndicator(count: Int, activeIndex: Int) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        repeat(count) { index ->
            Box(
                modifier = Modifier
                    .weight(if (index == activeIndex) 1.6f else 1f)
                    .height(4.dp)
                    .background(
                        color = androidx.compose.ui.graphics.Color.White.copy(
                            alpha = if (index == activeIndex) 0.95f else 0.36f
                        ),
                        shape = RoundedCornerShape(99.dp)
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
            style = MaterialTheme.typography.bodyLarge
        )
    }
}
