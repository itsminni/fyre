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
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.setValue
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
    private var notificationDestination by androidx.compose.runtime.mutableStateOf<minni.fyre.core.notifications.NotificationDestination?>(null)

    private fun readNotification(intent: android.content.Intent?) {
        notificationDestination = intent?.getStringExtra("notification_account")?.let { account ->
            minni.fyre.core.notifications.NotificationDestination(account,
                intent.getStringExtra("notification_kind").orEmpty(), intent.getStringExtra("notification_resource").orEmpty())
        }
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        readNotification(intent)
    }


    override fun onCreate(savedInstanceState: Bundle?) {
        setTheme(R.style.Theme_Fyre)
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        readNotification(intent)

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

                var verificationAttempt by remember { mutableIntStateOf(0) }
                LaunchedEffect(verificationAttempt) {
                    val restored = authViewModel.restoreSession()

                    if (restored) {
                        sessionViewModel.bootstrap(
                            isAuthenticated = true,
                            isProfileComplete = authViewModel.hasCompletedProfile()
                        )
                    } else if (authViewModel.globalError.value != null) {
                        sessionViewModel.verificationFailed()
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
                    sessionViewModel = sessionViewModel,
                    notificationDestination = notificationDestination,
                    onNotificationConsumed = {
                        notificationDestination = null
                        intent.removeExtra("notification_account")
                        intent.removeExtra("notification_kind")
                        intent.removeExtra("notification_resource")
                        intent.data = null
                    },
                    onRetrySession = {
                        sessionViewModel.verifyAgain()
                        verificationAttempt++
                    }
                )
            }
        }
    }
}

private fun ComponentActivity.applyLanguageIfNeeded(language: AppLanguage) {
    val desiredLocale = language.languageTag
        ?.let(Locale::forLanguageTag)
        ?: android.content.res.Resources.getSystem().configuration.locales.get(0)
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
