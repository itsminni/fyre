import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

val localProperties = Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.exists()) {
        file.reader().use(::load)
    }
}

fun appwriteConfigValue(name: String): String {
    val fromGradleProperty = providers.gradleProperty(name).orNull
    if (!fromGradleProperty.isNullOrBlank()) {
        return fromGradleProperty.trim()
    }

    val fromLocalProperties = localProperties.getProperty(name)
    if (!fromLocalProperties.isNullOrBlank()) {
        return fromLocalProperties.trim()
    }

    val fromEnvironment = System.getenv(name)
    if (!fromEnvironment.isNullOrBlank()) {
        return fromEnvironment.trim()
    }

    return ""
}

fun asBuildConfigString(value: String): String {
    val escaped = value
        .replace("\\", "\\\\")
        .replace("\"", "\\\"")
    return "\"$escaped\""
}

android {
    namespace = "com.example.fyre"
    compileSdk {
        version = release(36) {
            minorApiLevel = 1
        }
    }

    defaultConfig {
        applicationId = "com.example.fyre"
        minSdk = 29
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        buildConfigField(
            "boolean",
            "APPWRITE_BACKEND_ENABLED",
            appwriteConfigValue("APPWRITE_BACKEND_ENABLED")
                .ifBlank { "true" }
        )
        buildConfigField(
            "String",
            "APPWRITE_ENDPOINT",
            asBuildConfigString(
                appwriteConfigValue("APPWRITE_ENDPOINT")
                    .ifBlank { appwriteConfigValue("APPWRITE_PUBLIC_ENDPOINT") }
            )
        )
        buildConfigField(
            "String",
            "APPWRITE_PROJECT_ID",
            asBuildConfigString(appwriteConfigValue("APPWRITE_PROJECT_ID"))
        )
        buildConfigField(
            "String",
            "APPWRITE_DATABASE_ID",
            asBuildConfigString(appwriteConfigValue("APPWRITE_DATABASE_ID"))
        )
        buildConfigField(
            "String",
            "APPWRITE_PROFILES_TABLE_ID",
            asBuildConfigString(appwriteConfigValue("APPWRITE_PROFILES_TABLE_ID"))
        )
        buildConfigField(
            "String",
            "APPWRITE_AVATARS_BUCKET_ID",
            asBuildConfigString(appwriteConfigValue("APPWRITE_AVATARS_BUCKET_ID"))
        )
        buildConfigField(
            "String",
            "APPWRITE_CHAT_ATTACHMENTS_BUCKET_ID",
            asBuildConfigString(appwriteConfigValue("APPWRITE_CHAT_ATTACHMENTS_BUCKET_ID"))
        )
        buildConfigField(
            "String",
            "APPWRITE_EVENTS_TABLE_ID",
            asBuildConfigString(appwriteConfigValue("APPWRITE_EVENTS_TABLE_ID"))
        )
        buildConfigField(
            "String",
            "APPWRITE_EVENT_REGISTRATIONS_TABLE_ID",
            asBuildConfigString(appwriteConfigValue("APPWRITE_EVENT_REGISTRATIONS_TABLE_ID"))
        )
        buildConfigField(
            "String",
            "APPWRITE_THREADS_TABLE_ID",
            asBuildConfigString(appwriteConfigValue("APPWRITE_THREADS_TABLE_ID"))
        )
        buildConfigField(
            "String",
            "APPWRITE_THREAD_PARTICIPANTS_TABLE_ID",
            asBuildConfigString(appwriteConfigValue("APPWRITE_THREAD_PARTICIPANTS_TABLE_ID"))
        )
        buildConfigField(
            "String",
            "APPWRITE_MESSAGES_TABLE_ID",
            asBuildConfigString(appwriteConfigValue("APPWRITE_MESSAGES_TABLE_ID"))
        )
        buildConfigField(
            "String",
            "APPWRITE_SWIPES_TABLE_ID",
            asBuildConfigString(appwriteConfigValue("APPWRITE_SWIPES_TABLE_ID"))
        )
        buildConfigField(
            "String",
            "APPWRITE_MATCHES_TABLE_ID",
            asBuildConfigString(appwriteConfigValue("APPWRITE_MATCHES_TABLE_ID"))
        )
        buildConfigField(
            "String",
            "APPWRITE_RELATIONSHIPS_TABLE_ID",
            asBuildConfigString(appwriteConfigValue("APPWRITE_RELATIONSHIPS_TABLE_ID"))
        )
        buildConfigField(
            "String",
            "APPWRITE_REGISTER_FOR_EVENT_FUNCTION_ID",
            asBuildConfigString(appwriteConfigValue("APPWRITE_REGISTER_FOR_EVENT_FUNCTION_ID"))
        )
        buildConfigField(
            "String",
            "APPWRITE_CANCEL_EVENT_REGISTRATION_FUNCTION_ID",
            asBuildConfigString(appwriteConfigValue("APPWRITE_CANCEL_EVENT_REGISTRATION_FUNCTION_ID"))
        )
        buildConfigField(
            "String",
            "APPWRITE_EVENT_ADMIN_FUNCTION_ID",
            asBuildConfigString(appwriteConfigValue("APPWRITE_EVENT_ADMIN_FUNCTION_ID"))
        )
        buildConfigField(
            "String",
            "APPWRITE_CREATE_OR_GET_THREAD_FUNCTION_ID",
            asBuildConfigString(appwriteConfigValue("APPWRITE_CREATE_OR_GET_THREAD_FUNCTION_ID"))
        )
        buildConfigField(
            "String",
            "APPWRITE_SEND_MESSAGE_FUNCTION_ID",
            asBuildConfigString(appwriteConfigValue("APPWRITE_SEND_MESSAGE_FUNCTION_ID"))
        )
        buildConfigField(
            "String",
            "APPWRITE_RECORD_SWIPE_FUNCTION_ID",
            asBuildConfigString(appwriteConfigValue("APPWRITE_RECORD_SWIPE_FUNCTION_ID"))
        )
        buildConfigField(
            "String",
            "APPWRITE_DISCOVER_PROFILES_FUNCTION_ID",
            asBuildConfigString(appwriteConfigValue("APPWRITE_DISCOVER_PROFILES_FUNCTION_ID"))
        )
        buildConfigField(
            "String",
            "APPWRITE_MANAGE_RELATIONSHIP_FUNCTION_ID",
            asBuildConfigString(appwriteConfigValue("APPWRITE_MANAGE_RELATIONSHIP_FUNCTION_ID"))
        )
        buildConfigField(
            "String",
            "APPWRITE_CREATE_OR_GET_THREAD_FUNCTION_DOMAIN",
            asBuildConfigString(appwriteConfigValue("APPWRITE_CREATE_OR_GET_THREAD_FUNCTION_DOMAIN"))
        )
        buildConfigField(
            "String",
            "APPWRITE_SEND_MESSAGE_FUNCTION_DOMAIN",
            asBuildConfigString(appwriteConfigValue("APPWRITE_SEND_MESSAGE_FUNCTION_DOMAIN"))
        )
        buildConfigField(
            "String",
            "APPWRITE_RECORD_SWIPE_FUNCTION_DOMAIN",
            asBuildConfigString(appwriteConfigValue("APPWRITE_RECORD_SWIPE_FUNCTION_DOMAIN"))
        )
        buildConfigField(
            "String",
            "APPWRITE_DISCOVER_PROFILES_FUNCTION_DOMAIN",
            asBuildConfigString(appwriteConfigValue("APPWRITE_DISCOVER_PROFILES_FUNCTION_DOMAIN"))
        )
        buildConfigField(
            "String",
            "APPWRITE_EVENT_ADMIN_FUNCTION_DOMAIN",
            asBuildConfigString(appwriteConfigValue("APPWRITE_EVENT_ADMIN_FUNCTION_DOMAIN"))
        )
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    
    implementation(libs.androidx.navigation.compose)
    
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    
    implementation(libs.androidx.lifecycle.runtime.compose)
    
    implementation(libs.androidx.compose.material.icons.extended)
    
    implementation(libs.coil.compose)
    
    implementation(libs.google.gson)
    
    implementation(libs.androidx.datastore.preferences)
    
    implementation(libs.androidx.documentfile)
    
    implementation(libs.accompanist.permissions)
    
    implementation(libs.androidx.media3.exoplayer)
    implementation(libs.androidx.media3.ui)
    
    implementation(libs.androidx.work.runtime.ktx)
    
    implementation(libs.squareup.okhttp)
    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    debugImplementation(libs.androidx.compose.ui.tooling)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
}
