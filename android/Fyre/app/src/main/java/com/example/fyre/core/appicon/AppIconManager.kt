package com.example.fyre.core.appicon

import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import com.example.fyre.account.model.AppIconVariant

object AppIconManager {
    fun apply(context: Context, selected: AppIconVariant) {
        val appContext = context.applicationContext
        val packageManager = appContext.packageManager

        setAliasState(
            packageManager = packageManager,
            componentName = ComponentName(appContext.packageName, selected.launcherComponentName),
            enabled = true
        )

        AppIconVariant.entries
            .filterNot { it == selected }
            .forEach { variant ->
                setAliasState(
                    packageManager = packageManager,
                    componentName = ComponentName(appContext.packageName, variant.launcherComponentName),
                    enabled = false
                )
            }
    }

    private fun setAliasState(
        packageManager: PackageManager,
        componentName: ComponentName,
        enabled: Boolean
    ) {
        val desiredState = if (enabled) {
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED
        } else {
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED
        }
        if (packageManager.getComponentEnabledSetting(componentName) == desiredState) return

        packageManager.setComponentEnabledSetting(
            componentName,
            desiredState,
            PackageManager.DONT_KILL_APP
        )
    }
}
