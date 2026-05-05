# Fyre Android

## Italiano

Questa cartella contiene l'app Android di Fyre, sviluppata in Kotlin con Jetpack Compose. La versione Android copre autenticazione, completamento profilo, discovery, messaggi, eventi, account, preferenze locali, notifiche e integrazione Appwrite tramite REST e funzioni backend.

### Requisiti

- Android Studio recente.
- JDK compatibile con il progetto Gradle.
- Android SDK configurato.
- Emulatore o dispositivo Android.
- Configurazione Appwrite tramite `local.properties`, variabili Gradle o variabili d'ambiente.

### Quick start

1. Entrare nella cartella del progetto:

   ```bash
   cd android/Fyre
   ```

2. Compilare la build debug:

   ```bash
   ./gradlew assembleDebug
   ```

3. Per eseguire i test unitari:

   ```bash
   ./gradlew testDebugUnitTest
   ```

4. Per avviare l'app, aprire `android/Fyre` in Android Studio e usare Run su un emulatore o dispositivo.

### Librerie esterne

Le librerie esterne sono gestite da Gradle tramite `gradle/libs.versions.toml` e `app/build.gradle.kts`. Le principali sono:

- AndroidX Core, Lifecycle, Activity Compose e Navigation Compose.
- Jetpack Compose UI, Material 3, tool preview e test.
- DataStore Preferences per persistenza locale.
- Coil per caricamento immagini.
- Gson per serializzazione JSON.
- OkHttp per chiamate REST verso Appwrite.
- Accompanist Permissions per permessi runtime.
- DocumentFile per gestione URI/documenti.
- Media3 per audio e anteprime vocali.
- WorkManager per promemoria e notifiche locali programmate.
- JUnit, AndroidX Test, Espresso e Coroutines Test per i test.

Non serve installarle manualmente: Gradle le scarica automaticamente durante build o test.

### Configurazione backend

L'app legge i valori Appwrite da proprieta Gradle, `local.properties` o variabili d'ambiente. I nomi principali includono:

- `APPWRITE_BACKEND_ENABLED`
- `APPWRITE_ENDPOINT`
- `APPWRITE_PROJECT_ID`
- `APPWRITE_DATABASE_ID`
- `APPWRITE_PROFILES_TABLE_ID`
- `APPWRITE_EVENTS_TABLE_ID`
- `APPWRITE_THREADS_TABLE_ID`
- `APPWRITE_MESSAGES_TABLE_ID`
- `APPWRITE_DISCOVER_PROFILES_FUNCTION_ID`
- `APPWRITE_RECORD_SWIPE_FUNCTION_ID`
- `APPWRITE_SEND_MESSAGE_FUNCTION_ID`

### Struttura principale

- `app/src/main/java/com/example/fyre/ui`: flussi UI principali.
- `app/src/main/java/com/example/fyre/discover`: discovery e profili compatibili.
- `app/src/main/java/com/example/fyre/messages`: inbox, thread e messaggistica.
- `app/src/main/java/com/example/fyre/events`: eventi e iscrizioni.
- `app/src/main/java/com/example/fyre/account`: account e preferenze.
- `app/src/main/java/com/example/fyre/data`: repository, configurazione Appwrite e persistenza locale.

## English

This folder contains the Fyre Android app, built with Kotlin and Jetpack Compose. The Android version covers authentication, profile completion, discovery, messages, events, account management, local preferences, notifications, and Appwrite integration through REST and backend functions.

### Requirements

- A recent Android Studio version.
- A JDK compatible with the Gradle project.
- Android SDK configured.
- Android emulator or physical device.
- Appwrite configuration through `local.properties`, Gradle properties, or environment variables.

### Quick start

1. Go to the Android project folder:

   ```bash
   cd android/Fyre
   ```

2. Build the debug version:

   ```bash
   ./gradlew assembleDebug
   ```

3. Run unit tests:

   ```bash
   ./gradlew testDebugUnitTest
   ```

4. To run the app, open `android/Fyre` in Android Studio and use Run on an emulator or device.

### External libraries

External libraries are managed by Gradle through `gradle/libs.versions.toml` and `app/build.gradle.kts`. The main ones are:

- AndroidX Core, Lifecycle, Activity Compose, and Navigation Compose.
- Jetpack Compose UI, Material 3, preview tooling, and tests.
- DataStore Preferences for local persistence.
- Coil for image loading.
- Gson for JSON serialization.
- OkHttp for REST calls to Appwrite.
- Accompanist Permissions for runtime permissions.
- DocumentFile for URI and document handling.
- Media3 for audio and voice note previews.
- WorkManager for reminders and scheduled local notifications.
- JUnit, AndroidX Test, Espresso, and Coroutines Test for testing.

They do not need to be installed manually: Gradle downloads them automatically during build or test tasks.

### Backend configuration

The app reads Appwrite values from Gradle properties, `local.properties`, or environment variables. Main names include:

- `APPWRITE_BACKEND_ENABLED`
- `APPWRITE_ENDPOINT`
- `APPWRITE_PROJECT_ID`
- `APPWRITE_DATABASE_ID`
- `APPWRITE_PROFILES_TABLE_ID`
- `APPWRITE_EVENTS_TABLE_ID`
- `APPWRITE_THREADS_TABLE_ID`
- `APPWRITE_MESSAGES_TABLE_ID`
- `APPWRITE_DISCOVER_PROFILES_FUNCTION_ID`
- `APPWRITE_RECORD_SWIPE_FUNCTION_ID`
- `APPWRITE_SEND_MESSAGE_FUNCTION_ID`

### Main structure

- `app/src/main/java/com/example/fyre/ui`: main UI flows.
- `app/src/main/java/com/example/fyre/discover`: discovery and compatible profiles.
- `app/src/main/java/com/example/fyre/messages`: inbox, threads, and messaging.
- `app/src/main/java/com/example/fyre/events`: events and registrations.
- `app/src/main/java/com/example/fyre/account`: account and preferences.
- `app/src/main/java/com/example/fyre/data`: repositories, Appwrite configuration, and local persistence.
