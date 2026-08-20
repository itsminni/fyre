package minni.fyre

import android.content.res.Configuration
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
import minni.fyre.account.model.AppLanguage
import minni.fyre.account.model.ThemeMode
import minni.fyre.core.appicon.AppIconManager
import minni.fyre.core.notifications.AndroidNotificationGateway
import minni.fyre.data.AppGraphProvider
import minni.fyre.data.local.PersistedUserSettings
import minni.fyre.data.local.UserSettingsDataStore
import minni.fyre.ui.auth.AuthViewModel
import minni.fyre.ui.auth.AuthViewModelFactory
import minni.fyre.ui.navigation.AppSessionViewModel
import minni.fyre.ui.navigation.NavGraph
import minni.fyre.ui.theme.FyreTheme
import java.util.Locale

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        setTheme(R.style.Theme_Fyre)
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        val activityContext = this
        val appGraph = AppGraphProvider.get(applicationContext)
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
                    val restored = authViewModel.restoreSession()

                    if (restored) {
                        sessionViewModel.bootstrap(
                            isAuthenticated = true,
                            isProfileComplete = authViewModel.hasCompletedProfile()
                        )
                    } else {
                        sessionViewModel.bootstrap(
                            isAuthenticated = false,
                            isProfileComplete = false
                        )
                    }
                }

                NavGraph(
                    navController = navController,
                    authViewModel = authViewModel,
                    sessionViewModel = sessionViewModel
                )
            }
        }
    }
}

private fun ComponentActivity.applyLanguageIfNeeded(language: AppLanguage) {
    val desiredLocale = language.languageTag
        ?.let(Locale::forLanguageTag)
        ?: Locale.getDefault()
    val currentLocale = resources.configuration.locales.get(0)
    if (currentLocale == desiredLocale) return

    val configuration = Configuration(resources.configuration)
    val localeList = LocaleList(desiredLocale)
    LocaleList.setDefault(localeList)
    configuration.setLocales(localeList)
    configuration.setLocale(desiredLocale)
    @Suppress("DEPRECATION")
    resources.updateConfiguration(configuration, resources.displayMetrics)
    recreate()
}
