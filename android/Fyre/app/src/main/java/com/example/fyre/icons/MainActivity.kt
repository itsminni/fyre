package com.example.fyre

import android.content.res.Configuration
import android.os.Build
import android.os.Bundle
import android.os.LocaleList
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.rememberNavController
import com.example.fyre.account.model.AppLanguage
import com.example.fyre.account.model.ThemeMode
import com.example.fyre.core.appicon.AppIconManager
import com.example.fyre.core.notifications.AndroidNotificationGateway
import com.example.fyre.data.AppGraphProvider
import com.example.fyre.data.local.PersistedUserSettings
import com.example.fyre.data.local.SessionDataStore
import com.example.fyre.data.local.UserSettingsDataStore
import com.example.fyre.ui.auth.AuthViewModel
import com.example.fyre.ui.auth.AuthViewModelFactory
import com.example.fyre.ui.navigation.AppSessionViewModel
import com.example.fyre.ui.navigation.NavGraph
import com.example.fyre.ui.theme.FyreTheme
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.util.Locale

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        setTheme(R.style.Theme_Fyre)
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        val activityContext = this
        val appGraph = AppGraphProvider.get(applicationContext)
        val sessionDataStore = SessionDataStore(applicationContext)
        val userSettingsDataStore = UserSettingsDataStore(applicationContext)
        val notificationGateway = AndroidNotificationGateway(applicationContext)
        notificationGateway.createChannels()

        setContent {
            val persistedSettings by userSettingsDataStore.settings.collectAsState(
                initial = PersistedUserSettings()
            )
            val darkTheme = when (persistedSettings.themeMode) {
                ThemeMode.System -> isSystemInDarkTheme()
                ThemeMode.Light -> false
                ThemeMode.Dark -> true
            }

            LaunchedEffect(persistedSettings.appLanguage) {
                activityContext.applyLanguageIfNeeded(persistedSettings.appLanguage)
            }

            LaunchedEffect(persistedSettings.appIconVariant) {
                AppIconManager.apply(applicationContext, persistedSettings.appIconVariant)
            }

            FyreTheme(
                darkTheme = darkTheme,
                dynamicColor = false
            ) {
                val navController = rememberNavController()
                val authViewModel: AuthViewModel = viewModel(
                    factory = AuthViewModelFactory(appGraph.authRepository)
                )
                val sessionViewModel: AppSessionViewModel = viewModel()

                LaunchedEffect(Unit) {
                    val savedEmail = sessionDataStore.currentUserEmail.first()
                    val restored = authViewModel.restoreSession(savedEmail)

                    if (restored) {
                        sessionViewModel.bootstrap(
                            isAuthenticated = true,
                            isProfileComplete = authViewModel.hasCompletedProfile()
                        )
                    } else {
                        sessionDataStore.setCurrentUserEmail(null)
                        sessionViewModel.bootstrap(
                            isAuthenticated = false,
                            isProfileComplete = false
                        )
                    }

                    launch {
                        authViewModel.currentUser.collect { user ->
                            sessionDataStore.setCurrentUserEmail(user?.email)
                        }
                    }
                }

                NavGraph(
                    navController = navController,
                    authViewModel = authViewModel,
                    sessionViewModel = sessionViewModel,
                    sessionDataStore = sessionDataStore
                )
            }
        }
    }
}

private fun ComponentActivity.applyLanguageIfNeeded(language: AppLanguage) {
    val desiredLocale = language.languageTag
        ?.let(Locale::forLanguageTag)
        ?: Locale.getDefault()
    val currentLocale = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
        resources.configuration.locales.get(0)
    } else {
        @Suppress("DEPRECATION")
        resources.configuration.locale
    }
    if (currentLocale == desiredLocale) return

    val configuration = Configuration(resources.configuration)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
        val localeList = LocaleList(desiredLocale)
        LocaleList.setDefault(localeList)
        configuration.setLocales(localeList)
        configuration.setLocale(desiredLocale)
    } else {
        @Suppress("DEPRECATION")
        configuration.locale = desiredLocale
    }
    @Suppress("DEPRECATION")
    resources.updateConfiguration(configuration, resources.displayMetrics)
    recreate()
}
