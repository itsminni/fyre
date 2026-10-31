# Fyre Android

Kotlin app built with Jetpack Compose.

## Requirements

- JDK 21;
- Android Studio and Android SDK Platform 37 (the app targets API 36 and supports API 29+);
- an emulator or physical device to run the app.

## Offline demo

No Appwrite account, project, `.env`, or resource IDs are needed. Install Android SDK 37 and use JDK 21; Android Studio can locate the SDK, or set `ANDROID_HOME`.

```sh
./gradlew assembleDemo
# With an emulator or Android device connected:
./gradlew installDemo
```

Select the **demo** build variant in Android Studio. The APK is `app/build/outputs/apk/demo/app-demo.apk`, named **Fyre Demo**, with application ID `minni.fyre.demo`. It can coexist with the connected app. The demo manifest removes Internet permission and all Appwrite BuildConfig values are blank.

It opens a fictional profile, three discovery cards, a conversation with 120 paginated messages and two events. Likes create local matches; chat, attachments, profile edits, event registration and cancellation operate on local data. **Reset demo** restores the sample data. Data resets when the process restarts; device settings remain on that demo installation. The demo includes local event administration; it does not simulate remote delivery or server authorization.

A one-minute walkthrough: like a discovery card, open its match, send a message, open **Events**, join an event, then edit the profile. Existing chat history can be explored from **Messages → Taylor**. Use **Reset demo** before the next presentation.

Emulator UI checks:

```sh
./gradlew -PfyreUiDemo=true connectedDemoAndroidTest
```

## Setup

First [configure your own Appwrite backend](../../appwrite/README.md#one-time-appwrite-setup). Then, from the repository root:

```sh
cd android/Fyre
cp local.properties.example local.properties
./gradlew assembleDebug
```

Android Studio may add `sdk.dir`. Fill in the public Appwrite resource values and set `APPWRITE_BACKEND_ENABLED=true`, optional direct-function domains may stay empty. The same values can be supplied through Gradle properties or environment variables.

`local.properties` is ignored by Git, but its Appwrite values are embedded in the app. Missing or invalid backend configuration leaves the app in its backend-unavailable state. Photo uploads are limited to 10 MiB and chat attachments to 20 MiB, with server-side avatar validation in the shared media bucket.

Profile, discovery, swipe, and relationship operations use authenticated functions, there is no client-side fallback.

Open `android/Fyre` in Android Studio and run the debug variant. The CI release build is unsigned.

## Checks

```sh
./gradlew testDebugUnitTest lintDebug assembleRelease assembleDemo
```

Dependencies and versions are defined in [`gradle/libs.versions.toml`](gradle/libs.versions.toml) and [`app/build.gradle.kts`](app/build.gradle.kts). See the [main README](../../README.md), [Appwrite setup](../../appwrite/README.md), and [CI workflow](../../.github/workflows/ci.yml).

---

## Italiano

App Kotlin costruita con Jetpack Compose.

### Requisiti

- JDK 21;
- Android Studio e Android SDK Platform 37 (l'app punta a API 36 e supporta API 29+);
- un emulatore o dispositivo fisico per eseguire l'app.

### Demo offline

Non servono account, progetto o configurazione Appwrite. Con JDK 21 e Android SDK 37:

```sh
./gradlew assembleDemo
./gradlew installDemo  # emulatore o telefono collegato
```

In Android Studio selezionare la variante **demo**. L’APK `app/build/outputs/apk/demo/app-demo.apk` installa **Fyre Demo** (`minni.fyre.demo`), separata dall’app connessa. Il manifest non concede accesso a Internet e i valori Appwrite compilati sono vuoti.

La demo apre un profilo fittizio, tre schede discovery, una chat con 120 messaggi paginati e due eventi. Like, match, chat, allegati, modifica profilo e iscrizioni funzionano su dati locali. **Ripristina demo** ripristina i dati iniziali; anche il riavvio del processo li azzera. Le impostazioni del dispositivo restano nella sola installazione demo. Sono disponibili anche i controlli amministrativi locali degli eventi; consegna remota e autorizzazioni server richiedono il backend reale.

Percorso da un minuto: mettere un like, aprire il match, inviare un messaggio, iscriversi a un evento e modificare il profilo. La cronologia si esplora da **Messaggi → Taylor**. Ripristinare prima della presentazione successiva.

Test UI su emulatore:

```sh
./gradlew -PfyreUiDemo=true connectedDemoAndroidTest
```

### Avvio

Prima [configurare un proprio backend Appwrite](../../appwrite/README.md#configurazione-iniziale-su-appwrite). Poi, dalla root del repository:

```sh
cd android/Fyre
cp local.properties.example local.properties
./gradlew assembleDebug
```

Android Studio può aggiungere `sdk.dir`. Compilare i valori pubblici delle risorse Appwrite e impostare `APPWRITE_BACKEND_ENABLED=true`; i domini diretti opzionali delle funzioni possono restare vuoti. Gli stessi valori possono provenire da proprietà Gradle o variabili d'ambiente.

`local.properties` è ignorato da Git, ma i valori Appwrite vengono inclusi nell'app. Se la configurazione del backend è mancante o non valida, l'app segnala il backend come non disponibile. Gli upload delle foto sono limitati a 10 MiB e gli allegati chat a 20 MiB, con validazione server degli avatar nel bucket media unico.

Profilo, discovery, swipe e relazioni usano funzioni autenticate, non esiste un fallback client.

Aprire `android/Fyre` in Android Studio e avviare la variante debug. La release prodotta dalla CI rimane non firmata finché non viene configurato il signing del distributore.

### Verifiche

```sh
./gradlew testDebugUnitTest lintDebug assembleRelease assembleDemo
```

Dipendenze e versioni sono definite in [`gradle/libs.versions.toml`](gradle/libs.versions.toml) e [`app/build.gradle.kts`](app/build.gradle.kts). Consultare il [README principale](../../README.md#italiano), la [configurazione Appwrite](../../appwrite/README.md#italiano) e la [CI](../../.github/workflows/ci.yml).
