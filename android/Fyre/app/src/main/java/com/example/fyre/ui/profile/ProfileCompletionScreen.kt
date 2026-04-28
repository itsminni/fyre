package com.example.fyre.ui.profile

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.example.fyre.R
import com.example.fyre.data.model.ProfileFieldValues
import com.example.fyre.ui.auth.AuthViewModel
import com.example.fyre.ui.components.FyreButton
import com.example.fyre.ui.components.FyreTextField
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException

private const val MaxProfilePhotoCount = 6

private data class ProfileOption(
    val value: String,
    val labelRes: Int
)

private val GenderOptions = listOf(
    ProfileOption(ProfileFieldValues.GenderMale, R.string.profile_gender_male),
    ProfileOption(ProfileFieldValues.GenderFemale, R.string.profile_gender_female),
    ProfileOption(ProfileFieldValues.GenderNonBinary, R.string.profile_gender_non_binary),
    ProfileOption(ProfileFieldValues.GenderOther, R.string.profile_gender_other)
)

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
    ProfileOption(ProfileFieldValues.IntentCasual, R.string.profile_intent_casual),
    ProfileOption(ProfileFieldValues.IntentFriendship, R.string.profile_intent_friendship),
    ProfileOption(ProfileFieldValues.IntentNotSure, R.string.profile_intent_not_sure)
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileCompletionScreen(
    viewModel: AuthViewModel,
    onCompleteProfile: () -> Unit,
    onLogout: () -> Unit
) {
    val firstName by viewModel.profileFirstName.collectAsState()
    val lastName by viewModel.profileLastName.collectAsState()
    val city by viewModel.profileCity.collectAsState()
    val birthDate by viewModel.profileBirthDate.collectAsState()
    val bio by viewModel.profileBio.collectAsState()
    val avatarUri by viewModel.profileAvatarUri.collectAsState()
    val profilePhotoUris by viewModel.profilePhotoUris.collectAsState()
    val gender by viewModel.profileGender.collectAsState()
    val orientation by viewModel.profileOrientation.collectAsState()
    val intent by viewModel.profileIntent.collectAsState()
    val interests by viewModel.profileInterests.collectAsState()
    val instagramTag by viewModel.profileInstagramTag.collectAsState()
    val spotifyTag by viewModel.profileSpotifyTag.collectAsState()
    val preferredGenders by viewModel.profilePreferredGenders.collectAsState()
    val minPreferredAge by viewModel.profileMinPreferredAge.collectAsState()
    val maxPreferredAge by viewModel.profileMaxPreferredAge.collectAsState()
    val maxDistanceKm by viewModel.profileMaxDistanceKm.collectAsState()
    val smokes by viewModel.profileSmokes.collectAsState()
    val drinks by viewModel.profileDrinks.collectAsState()
    val profileError by viewModel.profileError.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()
    val profileSaveCompleted by viewModel.profileSaveCompleted.collectAsState()

    LaunchedEffect(Unit) {
        viewModel.hydrateProfileDraftFromCurrentUser()
    }

    LaunchedEffect(profileSaveCompleted) {
        if (profileSaveCompleted) {
            viewModel.consumeProfileSaveCompleted()
            onCompleteProfile()
        }
    }

    val avatarPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri ->
        viewModel.updateProfileAvatarUri(uri?.toString())
    }

    val galleryPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetMultipleContents()
    ) { uris ->
        viewModel.addProfilePhotoUris(uris.map { it.toString() })
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Top
    ) {
        Text(
            text = stringResource(R.string.profile_completion_title),
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center
        )

        Spacer(modifier = Modifier.height(12.dp))

        Text(
            text = stringResource(R.string.profile_completion_subtitle),
            style = MaterialTheme.typography.bodyLarge,
            textAlign = TextAlign.Center,
            color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.75f)
        )

        Spacer(modifier = Modifier.height(24.dp))

        ProfileSection(title = stringResource(R.string.profile_photo_section)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                AvatarPicker(
                    avatarUri = avatarUri,
                    onClick = { avatarPickerLauncher.launch("image/*") }
                )

                OutlinedButton(
                    onClick = { avatarPickerLauncher.launch("image/*") },
                    modifier = Modifier.weight(1f)
                ) {
                    Icon(
                        imageVector = Icons.Filled.PhotoCamera,
                        contentDescription = null,
                        modifier = Modifier.padding(end = 8.dp)
                    )
                    Text(text = stringResource(R.string.profile_photo_action))
                }
            }

            Text(
                text = stringResource(R.string.profile_completion_pick_avatar_hint),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }

        ProfileSection(title = stringResource(R.string.profile_photo_gallery_title)) {
            Text(
                text = stringResource(R.string.profile_photo_gallery_hint),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            OutlinedButton(
                onClick = { galleryPickerLauncher.launch("image/*") },
                enabled = profilePhotoUris.size < MaxProfilePhotoCount,
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(
                    imageVector = Icons.Filled.Add,
                    contentDescription = null,
                    modifier = Modifier.padding(end = 8.dp)
                )
                Text(text = stringResource(R.string.profile_photo_add_action))
            }

            if (profilePhotoUris.isEmpty()) {
                Text(
                    text = stringResource(R.string.profile_photo_gallery_empty),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            } else {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    profilePhotoUris.forEachIndexed { index, uri ->
                        ProfilePhotoThumbnail(
                            uri = uri,
                            index = index,
                            isFirst = index == 0,
                            canMoveLeft = index > 0,
                            canMoveRight = index < profilePhotoUris.lastIndex,
                            onRemove = { viewModel.removeProfilePhotoAt(index) },
                            onMoveLeft = { viewModel.moveProfilePhoto(index, -1) },
                            onMoveRight = { viewModel.moveProfilePhoto(index, 1) }
                        )
                    }
                }
            }
        }

        ProfileSection(title = stringResource(R.string.profile_section_required)) {
            FyreTextField(
                value = firstName,
                onValueChange = viewModel::updateProfileFirstName,
                label = stringResource(R.string.common_name)
            )

            FyreTextField(
                value = lastName,
                onValueChange = viewModel::updateProfileLastName,
                label = stringResource(R.string.common_last_name)
            )

            FyreTextField(
                value = city,
                onValueChange = viewModel::updateProfileCity,
                label = stringResource(R.string.common_city),
                supportingText = stringResource(R.string.profile_city_hint)
            )

            BirthDateField(
                value = birthDate,
                onValueChange = viewModel::updateProfileBirthDate,
                label = stringResource(R.string.profile_completion_birth_date),
                placeholder = stringResource(R.string.profile_completion_birth_date_placeholder)
            )

            ProfileOptionSelector(
                label = stringResource(R.string.profile_gender),
                selectedValue = gender,
                options = GenderOptions,
                onSelected = viewModel::updateProfileGender
            )

            ProfileOptionSelector(
                label = stringResource(R.string.profile_orientation),
                selectedValue = orientation,
                options = OrientationOptions,
                onSelected = viewModel::updateProfileOrientation
            )

            FyreTextField(
                value = bio,
                onValueChange = viewModel::updateProfileBio,
                label = stringResource(R.string.common_bio),
                singleLine = false,
                placeholder = stringResource(R.string.profile_completion_bio_placeholder)
            )
        }

        ProfileSection(title = stringResource(R.string.profile_section_discovery)) {
            ProfileOptionSelector(
                label = stringResource(R.string.profile_intent),
                selectedValue = intent,
                options = IntentOptions,
                onSelected = viewModel::updateProfileIntent
            )

            PreferredGendersSelector(
                selectedValues = preferredGenders,
                onCheckedChange = viewModel::setProfilePreferredGender
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                NumericProfileField(
                    value = minPreferredAge,
                    onValueChange = viewModel::updateProfileMinPreferredAge,
                    label = stringResource(R.string.profile_age_range_min),
                    modifier = Modifier.weight(1f)
                )
                NumericProfileField(
                    value = maxPreferredAge,
                    onValueChange = viewModel::updateProfileMaxPreferredAge,
                    label = stringResource(R.string.profile_age_range_max),
                    modifier = Modifier.weight(1f)
                )
            }

            NumericProfileField(
                value = maxDistanceKm,
                onValueChange = viewModel::updateProfileMaxDistanceKm,
                label = stringResource(R.string.profile_max_distance_km),
                placeholder = stringResource(R.string.common_none),
                supportingText = stringResource(R.string.profile_max_distance_km_hint)
            )

            FyreTextField(
                value = interests,
                onValueChange = viewModel::updateProfileInterests,
                label = stringResource(R.string.profile_interests),
                singleLine = false
            )
        }

        ProfileSection(title = stringResource(R.string.profile_section_social)) {
            FyreTextField(
                value = instagramTag,
                onValueChange = viewModel::updateProfileInstagramTag,
                label = stringResource(R.string.profile_instagram_tag),
                placeholder = stringResource(R.string.profile_social_placeholder)
            )

            FyreTextField(
                value = spotifyTag,
                onValueChange = viewModel::updateProfileSpotifyTag,
                label = stringResource(R.string.profile_spotify_tag),
                placeholder = stringResource(R.string.profile_social_placeholder)
            )
        }

        ProfileSection(title = stringResource(R.string.profile_section_preferences)) {
            ProfileSwitchRow(
                label = stringResource(R.string.profile_smokes),
                checked = smokes,
                onCheckedChange = viewModel::updateProfileSmokes
            )
            ProfileSwitchRow(
                label = stringResource(R.string.profile_drinks),
                checked = drinks,
                onCheckedChange = viewModel::updateProfileDrinks
            )
        }

        if (profileError != null) {
            Spacer(modifier = Modifier.height(10.dp))
            Text(
                text = profileError.orEmpty(),
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodyMedium
            )
        }

        Spacer(modifier = Modifier.height(20.dp))

        FyreButton(
            text = if (isLoading) {
                stringResource(R.string.profile_completion_loading)
            } else {
                stringResource(R.string.profile_completion_cta)
            },
            onClick = { viewModel.saveProfileSetup() },
            isLoading = isLoading
        )

        Spacer(modifier = Modifier.height(12.dp))

        OutlinedButton(
            onClick = onLogout,
            enabled = !isLoading,
            modifier = Modifier.fillMaxWidth()
        ) {
            if (isLoading) {
                CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
            } else {
                Text(stringResource(R.string.common_logout))
            }
        }
    }
}

@Composable
private fun ProfileSection(
    title: String,
    content: @Composable ColumnScope.() -> Unit
) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold
        )
        content()
    }
    Spacer(modifier = Modifier.height(22.dp))
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun BirthDateField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    placeholder: String
) {
    var showPicker by remember { mutableStateOf(false) }
    val fallbackDate = remember { LocalDate.now(ZoneOffset.UTC).minusYears(25) }
    val selectedDate = remember(value) { parseProfileDate(value) ?: fallbackDate }
    val datePickerState = androidx.compose.material3.rememberDatePickerState(
        initialSelectedDateMillis = selectedDate
            .atStartOfDay()
            .toInstant(ZoneOffset.UTC)
            .toEpochMilli()
    )

    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = Modifier
            .fillMaxWidth()
            .clickable { showPicker = true },
        label = { Text(label) },
        placeholder = { Text(placeholder) },
        readOnly = false,
        trailingIcon = {
            IconButton(onClick = { showPicker = true }) {
                Icon(
                    imageVector = Icons.Filled.CalendarMonth,
                    contentDescription = label
                )
            }
        },
        singleLine = true,
        shape = RoundedCornerShape(16.dp),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
    )

    if (showPicker) {
        DatePickerDialog(
            onDismissRequest = { showPicker = false },
            confirmButton = {
                TextButton(
                    onClick = {
                        datePickerState.selectedDateMillis
                            ?.let(::formatProfileDateMillis)
                            ?.let(onValueChange)
                        showPicker = false
                    }
                ) {
                    Text(stringResource(R.string.common_save))
                }
            },
            dismissButton = {
                TextButton(onClick = { showPicker = false }) {
                    Text(stringResource(R.string.common_cancel))
                }
            }
        ) {
            DatePicker(state = datePickerState)
        }
    }
}

@Composable
private fun AvatarPicker(
    avatarUri: String?,
    onClick: () -> Unit
) {
    Box(
        modifier = Modifier
            .size(96.dp)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        if (!avatarUri.isNullOrBlank()) {
            AsyncImage(
                model = avatarUri,
                contentDescription = stringResource(R.string.profile_completion_avatar_cd),
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize()
            )
        } else {
            Text(stringResource(R.string.common_avatar))
        }
    }
}

@Composable
private fun ProfilePhotoThumbnail(
    uri: String,
    index: Int,
    isFirst: Boolean,
    canMoveLeft: Boolean,
    canMoveRight: Boolean,
    onRemove: () -> Unit,
    onMoveLeft: () -> Unit,
    onMoveRight: () -> Unit
) {
    Column(
        modifier = Modifier.width(92.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Box(
            modifier = Modifier
                .width(86.dp)
                .height(112.dp)
                .clip(RoundedCornerShape(14.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant)
        ) {
            AsyncImage(
                model = uri,
                contentDescription = stringResource(R.string.profile_photo_position_cd, index + 1),
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize()
            )

            if (isFirst) {
                Text(
                    text = stringResource(R.string.profile_photo_primary_badge),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onPrimary,
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .padding(7.dp)
                        .background(
                            color = MaterialTheme.colorScheme.primary,
                            shape = RoundedCornerShape(10.dp)
                        )
                        .padding(horizontal = 8.dp, vertical = 4.dp)
                )
            }

            IconButton(
                onClick = onRemove,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .size(32.dp)
                    .padding(2.dp)
                    .background(
                        color = MaterialTheme.colorScheme.scrim.copy(alpha = 0.7f),
                        shape = CircleShape
                    )
            ) {
                Icon(
                    imageVector = Icons.Filled.Close,
                    contentDescription = stringResource(R.string.profile_photo_remove),
                    tint = MaterialTheme.colorScheme.onPrimary,
                    modifier = Modifier.size(16.dp)
                )
            }
        }

        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(2.dp)
        ) {
            IconButton(
                onClick = onMoveLeft,
                enabled = canMoveLeft,
                modifier = Modifier.size(28.dp)
            ) {
                Icon(
                    imageVector = Icons.Filled.ChevronLeft,
                    contentDescription = stringResource(R.string.profile_photo_move_left),
                    modifier = Modifier.size(18.dp)
                )
            }
            Text(
                text = (index + 1).toString(),
                style = MaterialTheme.typography.labelMedium,
                textAlign = TextAlign.Center,
                modifier = Modifier.width(18.dp)
            )
            IconButton(
                onClick = onMoveRight,
                enabled = canMoveRight,
                modifier = Modifier.size(28.dp)
            ) {
                Icon(
                    imageVector = Icons.Filled.ChevronRight,
                    contentDescription = stringResource(R.string.profile_photo_move_right),
                    modifier = Modifier.size(18.dp)
                )
            }
        }
    }
}

@Composable
private fun ProfileOptionSelector(
    label: String,
    selectedValue: String,
    options: List<ProfileOption>,
    onSelected: (String) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    val selectedOption = options.firstOrNull { it.value == selectedValue } ?: options.first()

    Box(modifier = Modifier.fillMaxWidth()) {
        OutlinedButton(
            onClick = { expanded = true },
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                modifier = Modifier.weight(1f),
                horizontalAlignment = Alignment.Start
            ) {
                Text(
                    text = label,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    text = stringResource(selectedOption.labelRes),
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }
            Icon(
                imageVector = Icons.Filled.ArrowDropDown,
                contentDescription = null
            )
        }

        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false }
        ) {
            options.forEach { option ->
                DropdownMenuItem(
                    text = { Text(stringResource(option.labelRes)) },
                    onClick = {
                        onSelected(option.value)
                        expanded = false
                    }
                )
            }
        }
    }
}

@Composable
private fun PreferredGendersSelector(
    selectedValues: List<String>,
    onCheckedChange: (String, Boolean) -> Unit
) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Text(
            text = stringResource(R.string.profile_preferred_genders),
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold
        )

        GenderOptions.forEach { option ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable {
                        onCheckedChange(option.value, option.value !in selectedValues)
                    }
                    .padding(vertical = 2.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Checkbox(
                    checked = option.value in selectedValues,
                    onCheckedChange = { checked -> onCheckedChange(option.value, checked) }
                )
                Text(
                    text = stringResource(option.labelRes),
                    style = MaterialTheme.typography.bodyLarge
                )
            }
        }
    }
}

@Composable
private fun NumericProfileField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    placeholder: String = "",
    supportingText: String? = null
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier.fillMaxWidth(),
        label = { Text(label) },
        placeholder = if (placeholder.isNotBlank()) {
            { Text(placeholder) }
        } else {
            null
        },
        supportingText = supportingText?.let {
            {
                Text(
                    text = it,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        shape = RoundedCornerShape(16.dp)
    )
}

@Composable
private fun ProfileSwitchRow(
    label: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                text = label,
                style = MaterialTheme.typography.bodyLarge,
                modifier = Modifier.weight(1f)
            )
            Switch(
                checked = checked,
                onCheckedChange = onCheckedChange
            )
        }
        HorizontalDivider()
    }
}

private fun parseProfileDate(value: String): LocalDate? {
    val trimmed = value.trim()
    if (trimmed.isBlank()) return null

    return runCatching {
        LocalDate.parse(trimmed, DateTimeFormatter.ofPattern("dd/MM/yyyy"))
    }.recoverCatching {
        LocalDate.parse(trimmed, DateTimeFormatter.ISO_LOCAL_DATE)
    }.recoverCatching { error ->
        if (error is DateTimeParseException) {
            Instant.parse(trimmed).atZone(ZoneOffset.UTC).toLocalDate()
        } else {
            throw error
        }
    }.getOrNull()
}

private fun formatProfileDateMillis(millis: Long): String {
    val date = Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate()
    return date.format(DateTimeFormatter.ofPattern("dd/MM/yyyy"))
}
