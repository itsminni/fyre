# Fyre Android

## Italiano

Questa cartella contiene l'app Android di Fyre, sviluppata in Kotlin con Jetpack Compose.

### Requisiti

- Android Studio recente.
- JDK compatibile con il progetto Gradle.
- Android SDK configurato.
- Emulatore o dispositivo Android.
- Configurazione Appwrite pubblica già inclusa nel progetto.

### Quick start

1. Entrare nella cartella del progetto:

   ```bash
   cd android/Fyre
   ```

2. Compilare la build release:

   ```bash
   ./gradlew assembleRelease
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

### Struttura principale

- `app/src/main/java/com/example/fyre/ui`: flussi UI principali.
- `app/src/main/java/com/example/fyre/discover`: discovery e profili compatibili.
- `app/src/main/java/com/example/fyre/messages`: inbox, thread e messaggistica.
- `app/src/main/java/com/example/fyre/events`: eventi e iscrizioni.
- `app/src/main/java/com/example/fyre/account`: account e preferenze.
- `app/src/main/java/com/example/fyre/data`: repository, configurazione Appwrite e persistenza locale.

## English

This folder contains the Fyre Android app, built with Kotlin and Jetpack Compose.

### Requirements

- A recent Android Studio version.
- A JDK compatible with the Gradle project.
- Android SDK configured.
- Android emulator or physical device.
- Public Appwrite configuration already included in the project.

### Quick start

1. Go to the Android project folder:

   ```bash
   cd android/Fyre
   ```

2. Build the release version:

   ```bash
   ./gradlew assembleRelease
   ```

3. Run unit tests:

   ```bash
   ./gradlew testDebugUnitTest
   ```

4. To run the app, open `android/Fyre` in Android Studio and use Run on an emulator or device.

### External Libraries

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

### Main Structure

- `app/src/main/java/com/example/fyre/ui`: main UI flows.
- `app/src/main/java/com/example/fyre/discover`: discovery and compatible profiles.
- `app/src/main/java/com/example/fyre/messages`: inbox, threads, and messaging.
- `app/src/main/java/com/example/fyre/events`: events and registrations.
- `app/src/main/java/com/example/fyre/account`: account and preferences.
- `app/src/main/java/com/example/fyre/data`: repositories, Appwrite configuration, and local persistence.
