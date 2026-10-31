package minni.fyre

import android.content.Intent
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import minni.fyre.data.demo.OfflineDemo
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class OfflineDemoUiTest {
    @get:Rule(order = 0) val permissions = object : org.junit.rules.ExternalResource() {
        override fun before() {
            org.junit.Assume.assumeTrue("Offline demo tests require the demo variant", BuildConfig.DEMO_MODE)
            if (android.os.Build.VERSION.SDK_INT >= 33) {
                val instrumentation = androidx.test.platform.app.InstrumentationRegistry.getInstrumentation()
                instrumentation.uiAutomation.grantRuntimePermission(instrumentation.targetContext.packageName,
                    android.Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }
    @get:Rule(order = 1) val compose = createAndroidComposeRule<MainActivity>()
    private fun text(id: Int) = compose.activity.getString(id)

    @Before fun demoOnly() {
        check(BuildConfig.DEMO_MODE) { "Run with -PfyreUiDemo=true connectedDemoAndroidTest" }
        compose.waitUntil(15_000) { runCatching { compose.onAllNodesWithText(text(R.string.tab_messages)).fetchSemanticsNodes().isNotEmpty() }.getOrDefault(false) }
    }

    @Test fun chat_history_send_and_reset_work_without_network() {
        compose.onNodeWithText(text(R.string.offline_demo_banner)).assertIsDisplayed()
        compose.onNodeWithText(text(R.string.tab_messages)).performClick()
        compose.onNodeWithText("Taylor").performClick()
        compose.onNodeWithText(text(R.string.messages_load_older)).performClick()
        compose.onNodeWithText(text(R.string.messages_load_older)).performClick()
        compose.onNodeWithText(text(R.string.messages_load_older)).assertDoesNotExist()
        compose.onNodeWithText(text(R.string.messages_draft_placeholder)).performTextInput("Hello offline demo")
        compose.onNodeWithContentDescription(text(R.string.messages_send_cd)).performClick()
        compose.onNodeWithText("Hello offline demo").assertExists()
        compose.onNodeWithText(text(R.string.offline_demo_reset)).performClick()
        compose.waitUntil(15_000) { compose.onAllNodesWithText(text(R.string.tab_discovery)).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText(text(R.string.tab_messages)).performClick()
        compose.onNodeWithText("Taylor").performClick()
        compose.onNodeWithText("Hello offline demo").assertDoesNotExist()
    }

    @Test fun notification_destination_requires_the_current_account() {
        compose.activityRule.scenario.onActivity { activity ->
            activity.startActivity(Intent(activity.intent).apply {
                flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
                putExtra("notification_account", "another-account")
                putExtra("notification_kind", "chat")
                putExtra("notification_resource", "demo-chat")
            })
        }
        compose.onNodeWithText("Taylor").assertDoesNotExist()
        compose.activityRule.scenario.onActivity { activity ->
            activity.startActivity(Intent(activity.intent).apply {
                flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
                putExtra("notification_account", OfflineDemo.ACCOUNT_ID)
                putExtra("notification_kind", "chat")
                putExtra("notification_resource", "demo-chat")
            })
        }
        compose.waitUntil(10_000) { compose.onAllNodesWithText("Taylor").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Taylor").assertIsDisplayed()
    }

    @Test fun event_registration_and_cancellation_work_offline() {
        compose.onNodeWithText(text(R.string.tab_events)).performClick()
        compose.onNodeWithText("Aperitivo Fyre · Demo").performClick()
        compose.onNodeWithText(text(R.string.events_action_join)).performClick()
        compose.onNodeWithText(text(R.string.events_action_cancel)).assertIsDisplayed().performClick()
        compose.onNodeWithText(text(R.string.events_action_join)).assertIsDisplayed()
    }
}
