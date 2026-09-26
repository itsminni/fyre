# Fyre Android

Kotlin app built with Jetpack Compose.

## Requirements

- JDK 21;
- Android Studio and the Android SDK required by the project;
- an emulator or physical device to run the app.

## Setup

First [configure your own Appwrite backend](../../appwrite/README.md#one-time-appwrite-setup). Then, from the repository root:

```sh
cd android/Fyre
cp local.properties.example local.properties
./gradlew assembleDebug
```

Android Studio may add `sdk.dir`. Fill in the public Appwrite resource values and set `APPWRITE_BACKEND_ENABLED=true`, optional direct-function domains may stay empty. The same values can be supplied through Gradle properties or environment variables.

`local.properties` is ignored by Git, but its Appwrite values are embedded in the app. Missing or invalid backend configuration leaves the app in its backend-unavailable state. Photo uploads are limited to 10 MiB and chat attachments to 20 MiB, matching the tracked Storage buckets.

Profile, discovery, swipe, and relationship operations use authenticated functions, there is no client-side fallback.

Open `android/Fyre` in Android Studio and run the debug variant. The CI release build is unsigned.

## Checks

```sh
./gradlew testDebugUnitTest lintDebug assembleRelease
```

Dependencies and versions are defined in [`gradle/libs.versions.toml`](gradle/libs.versions.toml) and [`app/build.gradle.kts`](app/build.gradle.kts). See the [main README](../../README.md), [Appwrite setup](../../appwrite/README.md), and [CI workflow](../../.github/workflows/ci.yml).

---

## Italiano

App Kotlin costruita con Jetpack Compose.

### Requisiti

- JDK 21;
- Android Studio e l'Android SDK richiesto dal progetto;
- un emulatore o dispositivo fisico per eseguire l'app.

### Avvio

Prima [configurare un proprio backend Appwrite](../../appwrite/README.md#configurazione-iniziale-su-appwrite). Poi, dalla root del repository:

```sh
cd android/Fyre
cp local.properties.example local.properties
./gradlew assembleDebug
```

Android Studio può aggiungere `sdk.dir`. Compilare i valori pubblici delle risorse Appwrite e impostare `APPWRITE_BACKEND_ENABLED=true`; i domini diretti opzionali delle funzioni possono restare vuoti. Gli stessi valori possono provenire da proprietà Gradle o variabili d'ambiente.

`local.properties` è ignorato da Git, ma i valori Appwrite vengono inclusi nell'app. Se la configurazione del backend è mancante o non valida, l'app segnala il backend come non disponibile. Gli upload delle foto sono limitati a 10 MiB e gli allegati chat a 20 MiB, in linea con i bucket Storage tracciati.

Profilo, discovery, swipe e relazioni usano funzioni autenticate, non esiste un fallback client.

Aprire `android/Fyre` in Android Studio e avviare la variante debug. La release prodotta dalla CI rimane non firmata finché non viene configurato il signing del distributore.

### Verifiche

```sh
./gradlew testDebugUnitTest lintDebug assembleRelease
```

Dipendenze e versioni sono definite in [`gradle/libs.versions.toml`](gradle/libs.versions.toml) e [`app/build.gradle.kts`](app/build.gradle.kts). Consultare il [README principale](../../README.md#italiano), la [configurazione Appwrite](../../appwrite/README.md#italiano) e la [CI](../../.github/workflows/ci.yml).
