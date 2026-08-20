package minni.fyre.account.presentation

import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.Key
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Palette
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import minni.fyre.R
import minni.fyre.account.model.AccountSection
import minni.fyre.account.model.AccountUiState
import minni.fyre.account.model.AppLanguage
import minni.fyre.account.model.AppIconVariant
import minni.fyre.account.model.ChatBackgroundStyle
import minni.fyre.account.model.ChatBubblePalette
import minni.fyre.account.model.ChatCustomizationSettings
import minni.fyre.account.model.DiscoveryPreferences
import minni.fyre.account.model.ProfileDraft
import minni.fyre.account.model.ThemeMode
import minni.fyre.core.appicon.AppIconManager
import minni.fyre.data.AppGraphProvider
import minni.fyre.data.local.UserSettingsDataStore
import minni.fyre.data.model.ProfileFieldValues
import minni.fyre.data.model.User
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import kotlin.math.PI
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt

private const val MaxProfilePhotoCount = 6

private enum class ChatColorSlot(val labelRes: Int) {
    Background1(R.string.account_chat_background_color_1),
    Background2(R.string.account_chat_background_color_2),
    Background3(R.string.account_chat_background_color_3),
    Send1(R.string.account_chat_send_color_1),
    Send2(R.string.account_chat_send_color_2),
    Send3(R.string.account_chat_send_color_3)
}

private data class ProfileOption(
    val value: String,
    val labelRes: Int
)

private val GenderOptions = ProfileFieldValues.SupportedGenders.map { gender ->
    ProfileOption(
        value = gender,
        labelRes = when (gender) {
            ProfileFieldValues.GenderMale -> R.string.profile_gender_male
            ProfileFieldValues.GenderFemale -> R.string.profile_gender_female
            ProfileFieldValues.GenderNonBinary -> R.string.profile_gender_non_binary
            else -> R.string.profile_gender_other
        }
    )
}

private val OrientationOptions = listOf(
    ProfileOption(ProfileFieldValues.OrientationStraight, R.string.profile_orientation_straight),
    ProfileOption(ProfileFieldValues.OrientationGay, R.string.profile_orientation_gay),
    ProfileOption(ProfileFieldValues.OrientationLesbian, R.string.profile_orientation_lesbian),
    ProfileOption(ProfileFieldValues.OrientationBisexual, R.string.profile_orientation_bisexual),
    ProfileOption(ProfileFieldValues.OrientationPansexual, R.string.profile_orientation_pansexual),
    ProfileOption(ProfileFieldValues.OrientationOther, R.string.profile_orientation_other)
)

private val IntentOptions = listOf(
    ProfileOption(ProfileFieldValues.IntentRelationship, R.string.profile_intent_relationship),
    ProfileOption(ProfileFieldValues.IntentFriendship, R.string.profile_intent_friendship),
    ProfileOption(ProfileFieldValues.IntentCasual, R.string.profile_intent_casual),
    ProfileOption(ProfileFieldValues.IntentNotSure, R.string.profile_intent_not_sure)
)

@Composable
fun AccountScreen(
    onLogout: () -> Unit,
    currentUser: User? = null,
    onUserUpdated: (User) -> Unit = {}
) {
    val context = LocalContext.current
    val appGraph = remember(context.applicationContext) {
        AppGraphProvider.get(context.applicationContext)
    }
    val userSettingsDataStore = remember(context.applicationContext) {
        UserSettingsDataStore(context.applicationContext)
    }

    val vm: AccountViewModel = viewModel(
        key = "account_${currentUser?.email.orEmpty()}",
        factory = AccountViewModelFactory(
            initialUser = currentUser,
            authRepository = appGraph.authRepository,
            eventsRepository = appGraph.eventsRepository,
            userSettingsDataStore = userSettingsDataStore,
            onUserUpdated = onUserUpdated
        )
    )
    val state by vm.uiState.collectAsState()

    val avatarPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri ->
        uri ?: return@rememberLauncherForActivityResult
        val draft = vm.uiState.value.profileDraft
        vm.updateProfileDraft(draft.copy(avatarUri = uri.toString()))
    }

    val galleryPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetMultipleContents()
    ) { uris ->
        if (uris.isEmpty()) return@rememberLauncherForActivityResult
        val draft = vm.uiState.value.profileDraft
        val additions = uris
            .map { it.toString() }
            .filterNot { it in draft.profilePhotoUris }
            .take((MaxProfilePhotoCount - draft.profilePhotoUris.size).coerceAtLeast(0))
        if (additions.isNotEmpty()) {
            vm.updateProfileDraft(
                draft.copy(profilePhotoUris = (draft.profilePhotoUris + additions).take(MaxProfilePhotoCount))
            )
        }
    }

    val pickAvatar = { avatarPickerLauncher.launch("image/*") }
    val addProfilePhotos = { galleryPickerLauncher.launch("image/*") }

    when (state.selectedSection) {
        null -> AccountHubSection(
            state = state,
            onOpenSection = vm::openSection,
            onPickAvatar = pickAvatar,
            onLogout = onLogout
        )

        AccountSection.EditProfile -> EditProfileSection(
            state = state,
            onBack = vm::backToHub,
            onDraftChange = vm::updateProfileDraft,
            onPickAvatar = pickAvatar,
            onAddPhotos = addProfilePhotos
        )

        AccountSection.DiscoveryPreferences -> DiscoveryPreferencesSection(
            state = state,
            onBack = vm::backToHub,
            onUpdate = vm::updateDiscoveryPreferences
        )

        AccountSection.Notifications -> NotificationsSection(
            state = state,
            onBack = vm::backToHub,
            onUpdate = vm::updateNotificationSettings
        )

        AccountSection.Appearance -> AppearanceSection(
            state = state,
            onBack = vm::backToHub,
            onSetThemeMode = vm::setThemeMode,
            onSetAppLanguage = vm::setAppLanguage,
            onSetAppIconVariant = { variant ->
                vm.setAppIconVariant(variant)
                AppIconManager.apply(context, variant)
            },
            onUpdateChatCustomization = vm::updateChatCustomizationSettings
        )

        AccountSection.EventHistory -> EventHistorySection(
            state = state,
            onBack = vm::backToHub
        )
    }
}

@Composable
private fun AccountHubSection(
    state: AccountUiState,
    onOpenSection: (AccountSection) -> Unit,
    onPickAvatar: () -> Unit,
    onLogout: () -> Unit
) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(accountBackground())
            .padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp)
    ) {
        item {
            Spacer(modifier = Modifier.height(8.dp))
            ProfileHubHeader(
                name = state.profileDraft.firstName.ifBlank {
                    state.displayName.substringBefore(" ").ifBlank { "Fyre" }
                },
                imageUri = state.profileDraft.avatarUri ?: state.profileDraft.profilePhotoUris.firstOrNull(),
                onPickAvatar = onPickAvatar
            )
        }

        item {
            Text(
                text = stringResource(R.string.account_segment_settings),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(horizontal = 4.dp)
            )
        }

        item {
            AccountNavigationList(
                sections = listOf(
                    AccountSection.EditProfile,
                    AccountSection.DiscoveryPreferences,
                    AccountSection.Notifications,
                    AccountSection.Appearance
                ),
                onOpenSection = onOpenSection
            )
        }

        item {
            EventsHubCard(
                state = state,
                onOpenEvents = { onOpenSection(AccountSection.EventHistory) }
            )
        }

        item {
            Button(
                onClick = onLogout,
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.Logout,
                    contentDescription = null,
                    modifier = Modifier.padding(end = 8.dp)
                )
                Text(text = stringResource(R.string.common_logout))
            }
            Spacer(modifier = Modifier.height(18.dp))
        }
    }
}

@Composable
private fun ProfileHubHeader(
    name: String,
    imageUri: String?,
    onPickAvatar: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 8.dp, bottom = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Box(
            modifier = Modifier
                .size(98.dp)
                .clickable(onClick = onPickAvatar)
        ) {
            ProfileAvatar(
                imageUri = imageUri,
                size = 95.dp
            )
            Surface(
                shape = CircleShape,
                color = Color.Black.copy(alpha = 0.72f),
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .size(30.dp)
            ) {
                Icon(
                    imageVector = Icons.Filled.CameraAlt,
                    contentDescription = stringResource(R.string.profile_photo_action),
                    tint = Color.White,
                    modifier = Modifier.padding(7.dp)
                )
            }
        }

        Text(
            text = name,
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
private fun AccountNavigationList(
    sections: List<AccountSection>,
    onOpenSection: (AccountSection) -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f)
        )
    ) {
        Column {
            sections.forEachIndexed { index, section ->
                SettingsNavigationRow(
                    title = stringResource(section.titleRes),
                    icon = section.icon(),
                    onClick = { onOpenSection(section) }
                )
                if (index < sections.lastIndex) {
                    HorizontalDivider(
                        modifier = Modifier.padding(start = 64.dp),
                        color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f)
                    )
                }
            }
        }
    }
}

@Composable
private fun SettingsNavigationRow(
    title: String,
    icon: ImageVector,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Surface(
            shape = RoundedCornerShape(8.dp),
            color = MaterialTheme.colorScheme.primary.copy(alpha = 0.12f),
            modifier = Modifier.size(34.dp)
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.padding(8.dp)
            )
        }
        Text(
            text = title,
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.weight(1f)
        )
        Icon(
            imageVector = Icons.Filled.ChevronRight,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun EventsHubCard(
    state: AccountUiState,
    onOpenEvents: () -> Unit
) {
    AccountCard(
        title = stringResource(R.string.account_section_event_history),
        icon = Icons.Filled.CalendarMonth
    ) {
        val recent = state.eventHistory.take(2)
        if (recent.isEmpty()) {
            Text(
                text = stringResource(R.string.account_events_empty),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                recent.forEach { item ->
                    EventSummaryRow(
                        title = item.title,
                        dateText = item.dateText,
                        place = item.place
                    )
                }
            }
        }

        OutlinedButton(
            onClick = onOpenEvents,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(text = stringResource(R.string.account_events_open_all))
            Spacer(modifier = Modifier.width(8.dp))
            Icon(imageVector = Icons.Filled.ChevronRight, contentDescription = null)
        }
    }
}

@Composable
private fun EditProfileSection(
    state: AccountUiState,
    onBack: () -> Unit,
    onDraftChange: (ProfileDraft) -> Unit,
    onPickAvatar: () -> Unit,
    onAddPhotos: () -> Unit
) {
    val profile = state.profileDraft

    SectionScaffold(title = stringResource(R.string.account_menu_account), onBack = onBack) {
        AccountCard(
            title = stringResource(R.string.profile_section_information),
            subtitle = stringResource(R.string.profile_section_information_hint),
            icon = Icons.Filled.Person
        ) {
            ProfileIdentityHeader(
                state = state,
                onPickAvatar = onPickAvatar
            )

            ReadOnlyProfileRows(
                firstName = profile.firstName,
                lastName = profile.lastName,
                email = state.email,
                birthDate = profile.birthDate
            )

            ProfilePhotoGalleryEditor(
                photos = profile.profilePhotoUris,
                onAddPhotos = onAddPhotos,
                onRemove = { index ->
                    onDraftChange(profile.copy(profilePhotoUris = profile.profilePhotoUris.removeAtIndex(index)))
                },
                onMove = { index, delta ->
                    onDraftChange(profile.copy(profilePhotoUris = profile.profilePhotoUris.moveBy(index, delta)))
                }
            )

            ProfilePickerField(
                title = stringResource(R.string.profile_gender),
                selectedValue = profile.gender,
                options = GenderOptions,
                onValueChange = { onDraftChange(profile.copy(gender = it)) }
            )

            ProfilePickerField(
                title = stringResource(R.string.profile_orientation),
                selectedValue = profile.orientation,
                options = OrientationOptions,
                onValueChange = { onDraftChange(profile.copy(orientation = it)) }
            )

            ProfileToggleField(
                title = stringResource(R.string.profile_smokes),
                checked = profile.smokes,
                onCheckedChange = { onDraftChange(profile.copy(smokes = it)) }
            )

            ProfileToggleField(
                title = stringResource(R.string.profile_drinks),
                checked = profile.drinks,
                onCheckedChange = { onDraftChange(profile.copy(drinks = it)) }
            )

            ProfileTextField(
                title = stringResource(R.string.profile_interests),
                value = profile.interests,
                onValueChange = { onDraftChange(profile.copy(interests = it)) }
            )

            ProfileTextField(
                title = stringResource(R.string.profile_instagram_tag),
                value = profile.instagramTag,
                onValueChange = { onDraftChange(profile.copy(instagramTag = it)) },
                placeholder = stringResource(R.string.profile_social_placeholder)
            )

            ProfileTextField(
                title = stringResource(R.string.profile_spotify_tag),
                value = profile.spotifyTag,
                onValueChange = { onDraftChange(profile.copy(spotifyTag = it)) },
                placeholder = stringResource(R.string.profile_social_placeholder)
            )
        }

        AccountCard(
            title = stringResource(R.string.profile_section_discovery),
            subtitle = stringResource(R.string.profile_section_discovery_hint),
            icon = Icons.Filled.Tune
        ) {
            ProfileTextField(
                title = stringResource(R.string.common_city),
                subtitle = stringResource(R.string.profile_city_hint),
                value = profile.city,
                onValueChange = { onDraftChange(profile.copy(city = it)) }
            )

            ProfileTextField(
                title = stringResource(R.string.common_bio),
                value = profile.bio,
                onValueChange = { onDraftChange(profile.copy(bio = it)) },
                minLines = 3
            )

            ProfilePickerField(
                title = stringResource(R.string.profile_intent),
                selectedValue = profile.intent,
                options = IntentOptions,
                onValueChange = { onDraftChange(profile.copy(intent = it)) }
            )

            ProfileMultiSelectField(
                title = stringResource(R.string.profile_preferred_genders),
                selectedValues = profile.preferredGenders,
                options = GenderOptions,
                onToggle = { value, selected ->
                    val nextValues = if (selected) {
                        (profile.preferredGenders + value).distinct()
                    } else {
                        profile.preferredGenders.filterNot { it == value }
                    }
                    if (nextValues.isNotEmpty()) {
                        onDraftChange(profile.copy(preferredGenders = nextValues))
                    }
                }
            )

            ProfileToggleField(
                title = stringResource(R.string.profile_exclude_smokers),
                checked = profile.excludeSmokers,
                onCheckedChange = { onDraftChange(profile.copy(excludeSmokers = it)) }
            )

            ProfileToggleField(
                title = stringResource(R.string.profile_exclude_drinkers),
                checked = profile.excludeDrinkers,
                onCheckedChange = { onDraftChange(profile.copy(excludeDrinkers = it)) }
            )

            ProfileAgeRangeField(
                minAge = profile.minPreferredAge,
                maxAge = profile.maxPreferredAge,
                onMinAgeChange = { nextMin ->
                    val clampedMin = nextMin.coerceIn(18, 98)
                    val nextMax = if (profile.maxPreferredAge <= clampedMin) {
                        maxOf(clampedMin + 1, 19).coerceAtMost(99)
                    } else {
                        profile.maxPreferredAge
                    }
                    onDraftChange(
                        profile.copy(
                            minPreferredAge = clampedMin,
                            maxPreferredAge = nextMax
                        )
                    )
                },
                onMaxAgeChange = { nextMax ->
                    val minimum = maxOf(profile.minPreferredAge + 1, 19)
                    onDraftChange(profile.copy(maxPreferredAge = nextMax.coerceIn(minimum, 99)))
                }
            )

            ProfileDistanceField(
                maxDistanceKm = profile.maxDistanceKm,
                onValueChange = { onDraftChange(profile.copy(maxDistanceKm = it)) }
            )
        }

        Text(
            text = if (state.isSavingProfile) {
                stringResource(R.string.account_profile_auto_saving)
            } else {
                stringResource(R.string.account_profile_auto_save)
            },
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = 4.dp)
        )

        state.statusMessage?.let { message ->
            Text(
                text = message,
                style = MaterialTheme.typography.bodySmall,
                color = if (message.contains("non", ignoreCase = true)) {
                    MaterialTheme.colorScheme.error
                } else {
                    MaterialTheme.colorScheme.onSurfaceVariant
                },
                modifier = Modifier.padding(horizontal = 4.dp)
            )
        }
    }
}

@Composable
private fun ProfileIdentityHeader(
    state: AccountUiState,
    onPickAvatar: () -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        ProfileAvatar(
            imageUri = state.profileDraft.avatarUri ?: state.profileDraft.profilePhotoUris.firstOrNull(),
            size = 84.dp
        )

        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                text = state.displayName.ifBlank { "Fyre" },
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold
            )
            Text(
                text = state.email,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            OutlinedButton(onClick = onPickAvatar) {
                Icon(
                    imageVector = Icons.Filled.CameraAlt,
                    contentDescription = null,
                    modifier = Modifier.padding(end = 8.dp)
                )
                Text(text = stringResource(R.string.profile_photo_action))
            }
        }
    }
}

@Composable
private fun ReadOnlyProfileRows(
    firstName: String,
    lastName: String,
    email: String,
    birthDate: String
) {
    Surface(
        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.52f),
        shape = RoundedCornerShape(8.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(horizontal = 14.dp)) {
            ProfileReadOnlyRow(stringResource(R.string.common_name), displayValue(firstName))
            HorizontalDivider()
            ProfileReadOnlyRow(stringResource(R.string.common_last_name), displayValue(lastName))
            HorizontalDivider()
            ProfileReadOnlyRow(stringResource(R.string.common_email), displayValue(email))
            HorizontalDivider()
            ProfileReadOnlyRow(
                stringResource(R.string.profile_completion_birth_date),
                formatProfileDate(birthDate)
            )
        }
    }
}

@Composable
private fun ProfileReadOnlyRow(title: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.Top
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(modifier = Modifier.weight(1f))
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            textAlign = TextAlign.End
        )
    }
}

@Composable
private fun ProfilePhotoGalleryEditor(
    photos: List<String>,
    onAddPhotos: () -> Unit,
    onRemove: (Int) -> Unit,
    onMove: (Int, Int) -> Unit
) {
    FieldSurface {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = stringResource(R.string.profile_photo_gallery_title),
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    text = stringResource(R.string.profile_photo_gallery_hint),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            OutlinedButton(
                onClick = onAddPhotos,
                enabled = photos.size < MaxProfilePhotoCount
            ) {
                Icon(
                    imageVector = Icons.Filled.Add,
                    contentDescription = null,
                    modifier = Modifier.padding(end = 6.dp)
                )
                Text(text = stringResource(R.string.profile_photo_add_action))
            }
        }

        if (photos.isEmpty()) {
            Text(
                text = stringResource(R.string.profile_photo_gallery_empty),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 18.dp)
            )
        } else {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                itemsIndexed(photos, key = { index, uri -> "$index:$uri" }) { index, uri ->
                    ProfilePhotoThumbnail(
                        uri = uri,
                        index = index,
                        count = photos.size,
                        onRemove = { onRemove(index) },
                        onMoveLeft = { onMove(index, -1) },
                        onMoveRight = { onMove(index, 1) }
                    )
                }
            }
        }
    }
}

@Composable
private fun ProfilePhotoThumbnail(
    uri: String,
    index: Int,
    count: Int,
    onRemove: () -> Unit,
    onMoveLeft: () -> Unit,
    onMoveRight: () -> Unit
) {
    Column(
        modifier = Modifier.width(92.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Box {
            AsyncImage(
                model = uri,
                contentDescription = stringResource(R.string.profile_photo_position_cd, index + 1),
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .width(92.dp)
                    .aspectRatio(0.78f)
                    .clip(RoundedCornerShape(8.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant)
            )

            if (index == 0) {
                Surface(
                    color = MaterialTheme.colorScheme.primary.copy(alpha = 0.92f),
                    shape = RoundedCornerShape(99.dp),
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .padding(8.dp)
                ) {
                    Text(
                        text = stringResource(R.string.profile_photo_primary_badge),
                        color = MaterialTheme.colorScheme.onPrimary,
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                    )
                }
            }

            IconButton(
                onClick = onRemove,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(4.dp)
                    .size(30.dp)
                    .background(Color.Black.copy(alpha = 0.72f), CircleShape)
            ) {
                Icon(
                    imageVector = Icons.Filled.Close,
                    contentDescription = stringResource(R.string.profile_photo_remove),
                    tint = Color.White,
                    modifier = Modifier.size(16.dp)
                )
            }
        }

        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            modifier = Modifier
                .background(
                    color = MaterialTheme.colorScheme.surface.copy(alpha = 0.58f),
                    shape = RoundedCornerShape(99.dp)
                )
        ) {
            IconButton(
                onClick = onMoveLeft,
                enabled = index > 0,
                modifier = Modifier.size(28.dp)
            ) {
                Icon(
                    imageVector = Icons.Filled.ChevronLeft,
                    contentDescription = stringResource(R.string.profile_photo_move_left)
                )
            }
            Text(
                text = (index + 1).toString(),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Bold
            )
            IconButton(
                onClick = onMoveRight,
                enabled = index < count - 1,
                modifier = Modifier.size(28.dp)
            ) {
                Icon(
                    imageVector = Icons.Filled.ChevronRight,
                    contentDescription = stringResource(R.string.profile_photo_move_right)
                )
            }
        }
    }
}

@Composable
private fun ProfileTextField(
    title: String,
    value: String,
    onValueChange: (String) -> Unit,
    subtitle: String? = null,
    placeholder: String = "",
    minLines: Int = 1
) {
    FieldSurface {
        Text(
            text = title,
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        if (!subtitle.isNullOrBlank()) {
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier.fillMaxWidth(),
            placeholder = { if (placeholder.isNotBlank()) Text(placeholder) },
            minLines = minLines
        )
    }
}

@Composable
private fun ProfilePickerField(
    title: String,
    selectedValue: String,
    options: List<ProfileOption>,
    onValueChange: (String) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    val selected = options.firstOrNull { it.value == selectedValue } ?: options.first()

    FieldSurface {
        Text(
            text = title,
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Box {
            OutlinedButton(
                onClick = { expanded = true },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    text = stringResource(selected.labelRes),
                    modifier = Modifier.weight(1f),
                    textAlign = TextAlign.Start
                )
                Icon(imageVector = Icons.Filled.ArrowDropDown, contentDescription = null)
            }
            DropdownMenu(
                expanded = expanded,
                onDismissRequest = { expanded = false }
            ) {
                options.forEach { option ->
                    DropdownMenuItem(
                        text = { Text(stringResource(option.labelRes)) },
                        onClick = {
                            expanded = false
                            onValueChange(option.value)
                        }
                    )
                }
            }
        }
    }
}

@Composable
private fun ProfileToggleField(
    title: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    FieldSurface {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(text = title, style = MaterialTheme.typography.bodyLarge)
            Switch(checked = checked, onCheckedChange = onCheckedChange)
        }
    }
}

@Composable
private fun ProfileMultiSelectField(
    title: String,
    selectedValues: List<String>,
    options: List<ProfileOption>,
    onToggle: (String, Boolean) -> Unit
) {
    FieldSurface {
        Text(
            text = "$title:",
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        options.forEach { option ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(text = stringResource(option.labelRes), style = MaterialTheme.typography.bodyMedium)
                Checkbox(
                    checked = option.value in selectedValues,
                    onCheckedChange = { selected -> onToggle(option.value, selected) }
                )
            }
        }
    }
}

@Composable
private fun ProfileAgeRangeField(
    minAge: Int,
    maxAge: Int,
    onMinAgeChange: (Int) -> Unit,
    onMaxAgeChange: (Int) -> Unit
) {
    FieldSurface {
        EditableNumberField(
            title = stringResource(R.string.profile_age_range_min),
            value = minAge,
            minValue = 18,
            maxValue = 98,
            maxDigits = 2,
            onValidValueChange = onMinAgeChange
        )
        HorizontalDivider()
        EditableNumberField(
            title = stringResource(R.string.profile_age_range_max),
            value = maxAge,
            minValue = maxOf(minAge + 1, 19),
            maxValue = 99,
            maxDigits = 2,
            onValidValueChange = onMaxAgeChange
        )
    }
}

@Composable
private fun ProfileDistanceField(
    maxDistanceKm: Int?,
    onValueChange: (Int?) -> Unit
) {
    FieldSurface {
        EditableNumberField(
            title = stringResource(R.string.profile_max_distance_km),
            subtitle = stringResource(R.string.profile_max_distance_km_hint),
            value = maxDistanceKm,
            minValue = 5,
            maxValue = 999,
            maxDigits = 3,
            placeholder = stringResource(R.string.common_none),
            suffix = "km",
            allowEmpty = true,
            onEmpty = { onValueChange(null) },
            onValidValueChange = { onValueChange(it) }
        )
    }
}

@Composable
private fun EditableNumberField(
    title: String,
    value: Int?,
    minValue: Int,
    maxValue: Int,
    maxDigits: Int,
    onValidValueChange: (Int) -> Unit,
    subtitle: String? = null,
    placeholder: String = "",
    suffix: String? = null,
    allowEmpty: Boolean = false,
    onEmpty: () -> Unit = {}
) {
    var text by rememberSaveable(title) { mutableStateOf(value?.toString().orEmpty()) }
    val normalizedValue = value?.toString().orEmpty()

    LaunchedEffect(normalizedValue) {
        if (normalizedValue != text && text.toIntOrNull() != value) {
            text = normalizedValue
        }
    }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(text = title, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                OutlinedTextField(
                    value = text,
                    onValueChange = { raw ->
                        val digits = raw.filter(Char::isDigit).take(maxDigits)
                        text = digits

                        if (digits.isBlank()) {
                            if (allowEmpty) {
                                onEmpty()
                            }
                            return@OutlinedTextField
                        }

                        val parsed = digits.toIntOrNull() ?: return@OutlinedTextField
                        if (parsed in minValue..maxValue) {
                            onValidValueChange(parsed)
                        }
                    },
                    modifier = Modifier.width(96.dp),
                    placeholder = { if (placeholder.isNotBlank()) Text(placeholder) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true,
                    textStyle = MaterialTheme.typography.titleMedium.copy(textAlign = TextAlign.End)
                )
                if (!suffix.isNullOrBlank() && text.isNotBlank()) {
                    Text(text = suffix, style = MaterialTheme.typography.titleMedium)
                }
            }
        }
        if (!subtitle.isNullOrBlank()) {
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun DiscoveryPreferencesSection(
    state: AccountUiState,
    onBack: () -> Unit,
    onUpdate: (DiscoveryPreferences) -> Unit
) {
    val prefs = state.discoveryPreferences

    SectionScaffold(title = stringResource(R.string.account_section_discovery_preferences), onBack = onBack) {
        AccountCard(
            title = stringResource(R.string.account_section_discovery_preferences),
            subtitle = stringResource(R.string.account_preferences_hint),
            icon = Icons.Filled.Tune
        ) {
            SettingSwitchRow(
                label = stringResource(R.string.account_switch_show_age),
                subtitle = stringResource(R.string.account_switch_show_age_hint),
                checked = prefs.showAge,
                onCheckedChange = { onUpdate(prefs.copy(showAge = it)) }
            )
            SettingSwitchRow(
                label = stringResource(R.string.account_switch_show_distance),
                subtitle = stringResource(R.string.account_switch_show_distance_hint),
                checked = prefs.showDistance,
                onCheckedChange = { onUpdate(prefs.copy(showDistance = it)) }
            )
            SettingSwitchRow(
                label = stringResource(R.string.account_switch_show_intent),
                subtitle = stringResource(R.string.account_switch_show_intent_hint),
                checked = prefs.showIntent,
                onCheckedChange = { onUpdate(prefs.copy(showIntent = it)) }
            )
            SettingSwitchRow(
                label = stringResource(R.string.account_switch_show_interests),
                subtitle = stringResource(R.string.account_switch_show_interests_hint),
                checked = prefs.showInterests,
                onCheckedChange = { onUpdate(prefs.copy(showInterests = it)) }
            )
            SettingSwitchRow(
                label = stringResource(R.string.account_switch_show_instagram),
                subtitle = stringResource(R.string.account_switch_show_instagram_hint),
                checked = prefs.showInstagramTag,
                onCheckedChange = { onUpdate(prefs.copy(showInstagramTag = it)) }
            )
            SettingSwitchRow(
                label = stringResource(R.string.account_switch_show_spotify),
                subtitle = stringResource(R.string.account_switch_show_spotify_hint),
                checked = prefs.showSpotifyTag,
                onCheckedChange = { onUpdate(prefs.copy(showSpotifyTag = it)) }
            )
        }
        state.statusMessage?.let {
            Text(text = it, style = MaterialTheme.typography.labelMedium)
        }
    }
}

@Composable
private fun NotificationsSection(
    state: AccountUiState,
    onBack: () -> Unit,
    onUpdate: (minni.fyre.account.model.NotificationSettings) -> Unit
) {
    val context = LocalContext.current
    val notifications = state.notificationSettings

    SectionScaffold(title = stringResource(R.string.account_section_notifications), onBack = onBack) {
        AccountCard(
            title = stringResource(R.string.account_section_notifications),
            subtitle = stringResource(R.string.account_notifications_hint),
            icon = Icons.Filled.Notifications
        ) {
            SettingSwitchRow(
                label = stringResource(R.string.account_switch_push_notifications),
                subtitle = stringResource(R.string.account_notifications_master_hint),
                checked = notifications.pushEnabled,
                onCheckedChange = { onUpdate(notifications.copy(pushEnabled = it)) }
            )
            SettingSwitchRow(
                label = stringResource(R.string.account_switch_matches),
                subtitle = stringResource(R.string.account_notifications_matches_hint),
                checked = notifications.matchNotifications,
                enabled = notifications.pushEnabled,
                onCheckedChange = { onUpdate(notifications.copy(matchNotifications = it)) }
            )
            SettingSwitchRow(
                label = stringResource(R.string.account_switch_messages),
                subtitle = stringResource(R.string.account_notifications_messages_hint),
                checked = notifications.messageNotifications,
                enabled = notifications.pushEnabled,
                onCheckedChange = { onUpdate(notifications.copy(messageNotifications = it)) }
            )
            SettingSwitchRow(
                label = stringResource(R.string.account_switch_event_reminders),
                subtitle = stringResource(R.string.account_notifications_events_hint),
                checked = notifications.eventReminders,
                enabled = notifications.pushEnabled,
                onCheckedChange = { onUpdate(notifications.copy(eventReminders = it)) }
            )
            Button(
                onClick = { context.openSystemNotificationSettings() },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(stringResource(R.string.account_notifications_open_settings))
            }
        }
        state.statusMessage?.let {
            Text(text = it, style = MaterialTheme.typography.labelMedium)
        }
    }
}

@Composable
private fun AppearanceSection(
    state: AccountUiState,
    onBack: () -> Unit,
    onSetThemeMode: (ThemeMode) -> Unit,
    onSetAppLanguage: (AppLanguage) -> Unit,
    onSetAppIconVariant: (AppIconVariant) -> Unit,
    onUpdateChatCustomization: (ChatCustomizationSettings) -> Unit
) {
    val appearance = state.appearanceSettings
    val chat = state.chatCustomizationSettings

    SectionScaffold(title = stringResource(R.string.account_section_appearance), onBack = onBack) {
        AccountCard(
            title = stringResource(R.string.account_section_appearance),
            icon = Icons.Filled.Palette
        ) {
            Text(
                text = stringResource(R.string.account_theme_label),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { onSetThemeMode(ThemeMode.System) }) {
                    Text(stringResource(R.string.account_theme_system))
                }
                OutlinedButton(onClick = { onSetThemeMode(ThemeMode.Light) }) {
                    Text(stringResource(R.string.account_theme_light))
                }
                OutlinedButton(onClick = { onSetThemeMode(ThemeMode.Dark) }) {
                    Text(stringResource(R.string.account_theme_dark))
                }
            }
            Text(text = stringResource(R.string.account_theme_current, appearance.themeMode.name))
        }

        AccountCard(
            title = stringResource(R.string.account_language_label),
            icon = Icons.Filled.Settings
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                AppLanguage.entries.forEach { language ->
                    OutlinedButton(onClick = { onSetAppLanguage(language) }) {
                        Text(stringResource(language.labelRes))
                    }
                }
            }
            Text(text = stringResource(R.string.account_language_current, stringResource(appearance.appLanguage.labelRes)))
        }

        AccountCard(
            title = stringResource(R.string.account_app_icon_label),
            icon = Icons.Filled.Image
        ) {
            AppIconVariant.entries.forEach { variant ->
                AppIconChoiceRow(
                    variant = variant,
                    selected = appearance.appIconVariant == variant,
                    onClick = { onSetAppIconVariant(variant) }
                )
            }
        }

        AccountCard(
            title = stringResource(R.string.account_chat_label),
            icon = Icons.Filled.Settings
        ) {
            SettingCycleRow(
                label = stringResource(R.string.account_chat_background_style),
                value = chat.backgroundStyle.name,
                onPrevious = {
                    onUpdateChatCustomization(
                        chat.copy(backgroundStyle = previousEntry(ChatBackgroundStyle.entries, chat.backgroundStyle))
                    )
                },
                onNext = {
                    onUpdateChatCustomization(
                        chat.copy(backgroundStyle = nextEntry(ChatBackgroundStyle.entries, chat.backgroundStyle))
                    )
                }
            )
            OutlinedTextField(
                value = ((chat.backgroundBrightness * 100).toInt()).toString(),
                onValueChange = {
                    val normalized = (it.toIntOrNull() ?: 0).coerceIn(-100, 100) / 100f
                    onUpdateChatCustomization(chat.copy(backgroundBrightness = normalized))
                },
                modifier = Modifier.fillMaxWidth(),
                label = { Text(stringResource(R.string.account_chat_background_brightness)) },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
            )
            ChatColorWheelSettings(
                chat = chat,
                onUpdate = onUpdateChatCustomization
            )
            SettingCycleRow(
                label = stringResource(R.string.account_chat_bubble_outgoing),
                value = chat.outgoingBubblePalette.name,
                onPrevious = {
                    onUpdateChatCustomization(
                        chat.copy(outgoingBubblePalette = previousEntry(ChatBubblePalette.entries, chat.outgoingBubblePalette))
                    )
                },
                onNext = {
                    onUpdateChatCustomization(
                        chat.copy(outgoingBubblePalette = nextEntry(ChatBubblePalette.entries, chat.outgoingBubblePalette))
                    )
                }
            )
            SettingCycleRow(
                label = stringResource(R.string.account_chat_bubble_incoming),
                value = chat.incomingBubblePalette.name,
                onPrevious = {
                    onUpdateChatCustomization(
                        chat.copy(incomingBubblePalette = previousEntry(ChatBubblePalette.entries, chat.incomingBubblePalette))
                    )
                },
                onNext = {
                    onUpdateChatCustomization(
                        chat.copy(incomingBubblePalette = nextEntry(ChatBubblePalette.entries, chat.incomingBubblePalette))
                    )
                }
            )
        }
        state.statusMessage?.let {
            Text(text = it, style = MaterialTheme.typography.labelMedium)
        }
    }
}

@Composable
private fun AppIconChoiceRow(
    variant: AppIconVariant,
    selected: Boolean,
    onClick: () -> Unit
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .clickable(onClick = onClick)
            .border(
                width = if (selected) 2.dp else 1.dp,
                color = if (selected) {
                    MaterialTheme.colorScheme.primary
                } else {
                    MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f)
                },
                shape = RoundedCornerShape(8.dp)
            ),
        color = MaterialTheme.colorScheme.surface.copy(alpha = if (selected) 0.82f else 0.48f),
        shape = RoundedCornerShape(8.dp)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Image(
                painter = painterResource(variant.previewRes),
                contentDescription = stringResource(variant.labelRes),
                modifier = Modifier
                    .size(54.dp)
                    .clip(RoundedCornerShape(14.dp))
            )
            Text(
                text = stringResource(variant.labelRes),
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                modifier = Modifier.weight(1f)
            )
            if (selected) {
                Icon(
                    imageVector = Icons.Filled.Check,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary
                )
            }
        }
    }
}

@Composable
private fun ChatColorWheelSettings(
    chat: ChatCustomizationSettings,
    onUpdate: (ChatCustomizationSettings) -> Unit
) {
    var selectedSlotName by rememberSaveable { mutableStateOf(ChatColorSlot.Background1.name) }
    val selectedSlot = ChatColorSlot.entries.firstOrNull { it.name == selectedSlotName }
        ?: ChatColorSlot.Background1
    val selectedHex = selectedSlot.colorFrom(chat)

    FieldSurface {
        Text(
            text = stringResource(R.string.account_chat_background_colors),
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold
        )
        ChatColorChoiceRow(
            slots = listOf(ChatColorSlot.Background1, ChatColorSlot.Background2, ChatColorSlot.Background3),
            selectedSlot = selectedSlot,
            chat = chat,
            onSelect = { selectedSlotName = it.name }
        )
        Text(
            text = stringResource(R.string.account_chat_send_colors),
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold
        )
        ChatColorChoiceRow(
            slots = listOf(ChatColorSlot.Send1, ChatColorSlot.Send2, ChatColorSlot.Send3),
            selectedSlot = selectedSlot,
            chat = chat,
            onSelect = { selectedSlotName = it.name }
        )
        Text(
            text = stringResource(R.string.account_chat_color_picker),
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        ColorWheelPicker(
            colorHex = selectedHex,
            onColorChange = { hex ->
                onUpdate(selectedSlot.updated(chat, hex))
            }
        )
    }
}

@Composable
private fun ChatColorChoiceRow(
    slots: List<ChatColorSlot>,
    selectedSlot: ChatColorSlot,
    chat: ChatCustomizationSettings,
    onSelect: (ChatColorSlot) -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        slots.forEach { slot ->
            val selected = slot == selectedSlot
            val color = slot.colorFrom(chat).composeColorOrFallback(MaterialTheme.colorScheme.primary)
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .clickable { onSelect(slot) }
                    .border(
                        width = if (selected) 2.dp else 1.dp,
                        color = if (selected) {
                            MaterialTheme.colorScheme.primary
                        } else {
                            MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f)
                        },
                        shape = RoundedCornerShape(8.dp)
                    ),
                color = MaterialTheme.colorScheme.surface.copy(alpha = if (selected) 0.80f else 0.48f),
                shape = RoundedCornerShape(8.dp)
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(28.dp)
                            .clip(CircleShape)
                            .background(color)
                            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, CircleShape)
                    )
                    Text(
                        text = stringResource(slot.labelRes),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                        modifier = Modifier.weight(1f)
                    )
                }
            }
        }
    }
}

@Composable
private fun ColorWheelPicker(
    colorHex: String,
    onColorChange: (String) -> Unit
) {
    var wheelSize by remember { mutableStateOf(IntSize.Zero) }
    val marker = remember(colorHex, wheelSize) {
        markerOffsetForColor(colorHex, wheelSize)
    }

    Box(
        modifier = Modifier.fillMaxWidth(),
        contentAlignment = Alignment.Center
    ) {
        Canvas(
            modifier = Modifier
                .size(184.dp)
                .onSizeChanged { wheelSize = it }
                .pointerInput(wheelSize) {
                    detectTapGestures { offset ->
                        colorHexFromWheelOffset(offset, wheelSize)?.let(onColorChange)
                    }
                }
                .pointerInput(wheelSize) {
                    detectDragGestures(
                        onDragStart = { offset ->
                            colorHexFromWheelOffset(offset, wheelSize)?.let(onColorChange)
                        },
                        onDrag = { change, _ ->
                            colorHexFromWheelOffset(change.position, wheelSize)?.let(onColorChange)
                        }
                    )
                }
        ) {
            val radius = min(size.width, size.height) / 2f
            val center = Offset(size.width / 2f, size.height / 2f)
            drawCircle(
                brush = Brush.sweepGradient(
                    listOf(
                        Color.Red,
                        Color.Yellow,
                        Color.Green,
                        Color.Cyan,
                        Color.Blue,
                        Color.Magenta,
                        Color.Red
                    ),
                    center = center
                ),
                radius = radius,
                center = center
            )
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(Color.White, Color.Transparent),
                    center = center,
                    radius = radius
                ),
                radius = radius,
                center = center
            )
            if (marker != null) {
                drawCircle(
                    color = Color.White,
                    radius = 8.dp.toPx(),
                    center = marker
                )
                drawCircle(
                    color = Color.Black.copy(alpha = 0.65f),
                    radius = 5.dp.toPx(),
                    center = marker
                )
            }
        }
    }
}

@Composable
private fun EventHistorySection(
    state: AccountUiState,
    onBack: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(accountBackground())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        SectionHeader(
            title = stringResource(R.string.account_section_event_history),
            onBack = onBack
        )

        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(state.eventHistory, key = { it.id }) { item ->
                AccountCard(
                    title = item.title,
                    icon = Icons.Filled.CalendarMonth
                ) {
                    Text(item.dateText, style = MaterialTheme.typography.bodyMedium)
                    Text(item.place, style = MaterialTheme.typography.bodyMedium)
                    Text(
                        text = stringResource(R.string.account_event_status, item.status.name),
                        style = MaterialTheme.typography.labelMedium
                    )
                }
            }
        }
    }
}

@Composable
private fun SectionScaffold(
    title: String,
    onBack: () -> Unit,
    content: @Composable ColumnScope.() -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(accountBackground())
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        SectionHeader(title = title, onBack = onBack)
        content()
    }
}

@Composable
private fun SectionHeader(title: String, onBack: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        IconButton(onClick = onBack) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                contentDescription = stringResource(R.string.account_back_to_hub_cd)
            )
        }
        Text(text = title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun AccountCard(
    title: String,
    icon: ImageVector,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    content: @Composable ColumnScope.() -> Unit
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f)
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.Top,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = MaterialTheme.colorScheme.primary.copy(alpha = 0.12f),
                    modifier = Modifier.size(32.dp)
                ) {
                    Icon(
                        imageVector = icon,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.padding(8.dp)
                    )
                }
                Column(verticalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.weight(1f)) {
                    Text(text = title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    if (!subtitle.isNullOrBlank()) {
                        Text(
                            text = subtitle,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
            content()
        }
    }
}

@Composable
private fun FieldSurface(content: @Composable ColumnScope.() -> Unit) {
    Surface(
        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.52f),
        shape = RoundedCornerShape(8.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
            content = content
        )
    }
}

@Composable
private fun ProfileAvatar(
    imageUri: String?,
    size: androidx.compose.ui.unit.Dp
) {
    if (!imageUri.isNullOrBlank()) {
        AsyncImage(
            model = imageUri,
            contentDescription = stringResource(R.string.profile_completion_avatar_cd),
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .size(size)
                .clip(CircleShape)
                .border(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f), CircleShape)
        )
    } else {
        Icon(
            imageVector = Icons.Filled.AccountCircle,
            contentDescription = stringResource(R.string.profile_completion_avatar_cd),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(size)
        )
    }
}

@Composable
private fun SettingSwitchRow(
    label: String,
    subtitle: String? = null,
    checked: Boolean,
    enabled: Boolean = true,
    onCheckedChange: (Boolean) -> Unit
) {
    FieldSurface {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .alpha(if (enabled) 1f else 0.45f),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(3.dp)
            ) {
                Text(text = label, style = MaterialTheme.typography.bodyLarge)
                if (!subtitle.isNullOrBlank()) {
                    Text(
                        text = subtitle,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            Switch(
                checked = checked,
                enabled = enabled,
                onCheckedChange = onCheckedChange
            )
        }
    }
}

@Composable
private fun SettingCycleRow(
    label: String,
    value: String,
    onPrevious: () -> Unit,
    onNext: () -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Text(text = label, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
        OutlinedButton(onClick = onPrevious) {
            Text("<")
        }
        Text(text = value, style = MaterialTheme.typography.labelLarge)
        OutlinedButton(onClick = onNext) {
            Text(">")
        }
    }
}

@Composable
private fun EventSummaryRow(
    title: String,
    dateText: String,
    place: String
) {
    Surface(
        shape = RoundedCornerShape(8.dp),
        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.52f),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Text(text = title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            Text(text = dateText, style = MaterialTheme.typography.bodySmall)
            Text(text = place, style = MaterialTheme.typography.bodySmall)
        }
    }
}

private fun AccountSection.icon(): ImageVector {
    return when (this) {
        AccountSection.EditProfile -> Icons.Filled.Key
        AccountSection.DiscoveryPreferences -> Icons.Filled.Tune
        AccountSection.Notifications -> Icons.Filled.Notifications
        AccountSection.Appearance -> Icons.Filled.Palette
        AccountSection.EventHistory -> Icons.Filled.CalendarMonth
    }
}

@Composable
private fun accountBackground(): Brush {
    return Brush.verticalGradient(
        listOf(
            MaterialTheme.colorScheme.background,
            MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.42f)
        )
    )
}

private fun ChatColorSlot.colorFrom(chat: ChatCustomizationSettings): String {
    return when (this) {
        ChatColorSlot.Background1 -> chat.backgroundColor1Hex
        ChatColorSlot.Background2 -> chat.backgroundColor2Hex
        ChatColorSlot.Background3 -> chat.backgroundColor3Hex
        ChatColorSlot.Send1 -> chat.sendButtonColor1Hex
        ChatColorSlot.Send2 -> chat.sendButtonColor2Hex
        ChatColorSlot.Send3 -> chat.sendButtonColor3Hex
    }
}

private fun ChatColorSlot.updated(chat: ChatCustomizationSettings, colorHex: String): ChatCustomizationSettings {
    val sanitized = colorHex.sanitizeHexColor()
    return when (this) {
        ChatColorSlot.Background1 -> chat.copy(
            backgroundStyle = ChatBackgroundStyle.CustomGradient,
            backgroundColor1Hex = sanitized
        )

        ChatColorSlot.Background2 -> chat.copy(
            backgroundStyle = ChatBackgroundStyle.CustomGradient,
            backgroundColor2Hex = sanitized
        )

        ChatColorSlot.Background3 -> chat.copy(
            backgroundStyle = ChatBackgroundStyle.CustomGradient,
            backgroundColor3Hex = sanitized
        )

        ChatColorSlot.Send1 -> chat.copy(sendButtonColor1Hex = sanitized)
        ChatColorSlot.Send2 -> chat.copy(sendButtonColor2Hex = sanitized)
        ChatColorSlot.Send3 -> chat.copy(sendButtonColor3Hex = sanitized)
    }
}

private fun String.composeColorOrFallback(fallback: Color): Color {
    return runCatching {
        Color(android.graphics.Color.parseColor(sanitizeHexColor()))
    }.getOrElse { fallback }
}

private fun colorHexFromWheelOffset(offset: Offset, wheelSize: IntSize): String? {
    val width = wheelSize.width.takeIf { it > 0 } ?: return null
    val height = wheelSize.height.takeIf { it > 0 } ?: return null
    val centerX = width / 2f
    val centerY = height / 2f
    val radius = min(width, height) / 2f
    val dx = offset.x - centerX
    val dy = offset.y - centerY
    val distance = sqrt(dx * dx + dy * dy).coerceAtMost(radius)
    val saturation = (distance / radius).coerceIn(0f, 1f)
    val hue = ((atan2(dy, dx) * 180f / PI.toFloat()) + 360f) % 360f
    val colorInt = android.graphics.Color.HSVToColor(floatArrayOf(hue, saturation, 1f))
    return "#${(colorInt and 0xFFFFFF).toString(16).padStart(6, '0').uppercase()}"
}

private fun markerOffsetForColor(colorHex: String, wheelSize: IntSize): Offset? {
    val width = wheelSize.width.takeIf { it > 0 } ?: return null
    val height = wheelSize.height.takeIf { it > 0 } ?: return null
    val hsv = FloatArray(3)
    val parsed = runCatching {
        android.graphics.Color.parseColor(colorHex.sanitizeHexColor())
    }.getOrElse {
        android.graphics.Color.WHITE
    }
    android.graphics.Color.colorToHSV(parsed, hsv)

    val radius = min(width, height) / 2f * hsv[1].coerceIn(0f, 1f)
    val angle = hsv[0] * PI.toFloat() / 180f
    return Offset(
        x = width / 2f + cos(angle) * radius,
        y = height / 2f + sin(angle) * radius
    )
}

private fun <T> nextEntry(entries: List<T>, current: T): T {
    val index = entries.indexOf(current)
    return entries[(index + 1).floorMod(entries.size)]
}

private fun <T> previousEntry(entries: List<T>, current: T): T {
    val index = entries.indexOf(current)
    return entries[(index - 1).floorMod(entries.size)]
}

private fun Int.floorMod(modulus: Int): Int {
    return ((this % modulus) + modulus) % modulus
}

private fun String.sanitizeHexColor(): String {
    val clean = trim().removePrefix("#").filter { it.isDigit() || it.lowercaseChar() in 'a'..'f' }.take(6)
    return if (clean.isEmpty()) "#" else "#${clean.uppercase()}"
}

private fun android.content.Context.openSystemNotificationSettings() {
    val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
        putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
    }
    runCatching { startActivity(intent) }.onFailure {
        startActivity(
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.fromParts("package", packageName, null)
            }
        )
    }
}

private fun String.digitsOrNull(): Int? {
    val digits = filter(Char::isDigit)
    return digits.toIntOrNull()
}

private fun <T> List<T>.removeAtIndex(index: Int): List<T> {
    if (index !in indices) return this
    return toMutableList().also { it.removeAt(index) }
}

private fun <T> List<T>.moveBy(index: Int, delta: Int): List<T> {
    val targetIndex = index + delta
    if (index !in indices || targetIndex !in indices) return this
    return toMutableList().also { it.swap(index, targetIndex) }
}

private fun <T> MutableList<T>.swap(first: Int, second: Int) {
    val firstValue = this[first]
    this[first] = this[second]
    this[second] = firstValue
}

private fun displayValue(value: String): String {
    return value.trim().ifBlank { "-" }
}

private fun formatProfileDate(value: String): String {
    val trimmed = value.trim()
    if (trimmed.isBlank()) return "-"
    val parsed = parseProfileDate(trimmed) ?: return trimmed
    return parsed.format(DateTimeFormatter.ofPattern("dd/MM/yyyy"))
}

private fun parseProfileDate(value: String): LocalDate? {
    return runCatching {
        LocalDate.parse(value, DateTimeFormatter.ofPattern("dd/MM/yyyy"))
    }.recoverCatching {
        LocalDate.parse(value, DateTimeFormatter.ISO_LOCAL_DATE)
    }.recoverCatching { error ->
        if (error is DateTimeParseException) {
            Instant.parse(value).atZone(ZoneOffset.UTC).toLocalDate()
        } else {
            throw error
        }
    }.getOrNull()
}
