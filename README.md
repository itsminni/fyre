# Fyre

## Italiano

Fyre è un progetto multi-piattaforma per dating, social discovery, messaggistica ed eventi. Il repository contiene tre client applicativi e un backend basato su Appwrite:

- app iOS in SwiftUI;
- app Android in Jetpack Compose;
- client web in React + TypeScript con Vite;
- funzioni Appwrite in JavaScript per la logica server-side.

Le funzionalità principali includono registrazione e login, completamento del profilo, scoperta di profili compatibili, swipe con like o skip, creazione del match solo in caso di interesse reciproco, chat tra utenti abbinati, gestione delle relazioni, iscrizione agli eventi, lista d'attesa, strumenti admin per gli eventi e notifiche locali o realtime dove supportate dal client.

### Struttura del repository

- `ios/`: sorgenti dell'app iOS, progetto Xcode e test.
- `android/`: sorgenti dell'app Android e progetto Gradle.
- `web/`: client web React + TypeScript.
- `functions/`: funzioni cloud Appwrite usate dal dominio applicativo.
- `shared/`: contratti condivisi tra funzioni e client.

### Quick start generale

#### iOS

1. Aprire `ios/Fyre/Fyre.xcodeproj` in Xcode.
2. Selezionare lo schema `Fyre`.
3. Avviare l'app su simulatore o dispositivo.

Documentazione specifica: `ios/README.md`.

#### Android

1. Entrare nella cartella `android/Fyre`.
2. Eseguire `./gradlew assembleRelease`.
3. Aprire il progetto in Android Studio o installare l'APK generato su un emulatore/dispositivo.

Documentazione specifica: `android/Fyre/README.md`.

#### Web

1. Entrare nella cartella `web`.
2. Eseguire `npm install`.
3. Eseguire `npm run dev`.

Documentazione specifica: `web/README.md`.

#### Backend Appwrite

Le funzioni backend si trovano in `functions/` e gestiscono discovery, swipe, match, chat, relazioni ed eventi. Ogni funzione è pensata per essere distribuita su Appwrite con le variabili d'ambiente richieste dai sorgenti delle funzioni.

Documentazione specifica: `functions/README.md`.

### Configurazione pubblica e platform Appwrite
I client includono già gli ID progetto Appwrite pubblici usati da questo repository. 

- Web: hostname `localhost` e `127.0.0.1` per lo sviluppo locale,
- iOS: Apple platform con bundle identifier dell'app Xcode.
- Android: Android platform con `applicationId` dell'app Gradle.


### Librerie esterne e installazione

Il progetto utilizza librerie esterne diverse in base alla piattaforma:

- Web: dipendenze npm definite in `web/package.json`, tra cui React, React Router, Appwrite SDK, TypeScript, Vite, ESLint e Vitest. Si installano con `npm install` dentro `web/`.
- Android: dipendenze Gradle definite in `android/Fyre/gradle/libs.versions.toml` e `android/Fyre/app/build.gradle.kts`, tra cui Jetpack Compose, Navigation Compose, DataStore, Coil, Gson, OkHttp, Media3, WorkManager e Accompanist Permissions. Gradle le scarica automaticamente con `./gradlew assembleRelease` o `./gradlew testDebugUnitTest`.
- iOS: non sono dichiarate librerie esterne nel `Podfile`.
- Backend Appwrite: le funzioni usano JavaScript ES Modules e API runtime standard.

Per i dettagli specifici vedere i README delle singole versioni.

### Visualizzazione admin

La modalità admin usa gli account configurati nel backend Appwrite.

## English

Fyre is a multi-platform project for dating, social discovery, messaging, and event participation. The repository contains three application clients and an Appwrite-based backend:

- iOS app built with SwiftUI;
- Android app built with Jetpack Compose;
- web client built with React + TypeScript and Vite;
- JavaScript Appwrite functions for server-side domain logic.

The main features include sign-up and login, profile completion, compatible profile discovery, swipe actions with like or skip, match creation only after mutual interest, chat between matched users, relationship management, event registration, waitlist handling, event admin tools, and local or realtime notifications where supported by the client.

### Repository structure

- `ios/`: iOS app source, Xcode project, and tests.
- `android/`: Android app source and Gradle project.
- `web/`: React + TypeScript web client.
- `functions/`: Appwrite cloud functions used by the app domain.
- `shared/`: shared contracts used by functions and clients.

### General quick start

#### iOS

1. Open `ios/Fyre/Fyre.xcodeproj` in Xcode.
2. Select the `Fyre` scheme.
3. Run the app on a simulator or device.

Specific documentation: `ios/README.md`.

#### Android

1. Go to `android/Fyre`.
2. Run `./gradlew assembleRelease`.
3. Open the project in Android Studio or install the generated APK on an emulator/device.

Specific documentation: `android/Fyre/README.md`.

#### Web

1. Go to `web`.
2. Run `npm install`.
3. Run `npm run dev`.

Specific documentation: `web/README.md`.

#### Appwrite backend

Backend functions are located in `functions/` and handle discovery, swipes, matches, chat, relationships, and events. Each function is intended to be deployed on Appwrite with the environment variables required by the function source files.

Specific documentation: `functions/README.md`.

### Public configuration and Appwrite platforms

The clients already include the public Appwrite project IDs used by this repository.

- Web: hostnames `localhost` and `127.0.0.1` for local development.
- iOS: an Apple platform with the Xcode app bundle identifier.
- Android: an Android platform with the Gradle app `applicationId`.

Web city search uses Photon's public endpoint by default, so it does not require keys or environment variables. The provider can be changed by setting `VITE_PHOTON_BASE_URL` before building.

### External libraries and installation

The project uses different external libraries depending on the platform:

- Web: npm dependencies defined in `web/package.json`, including React, React Router, Appwrite SDK, TypeScript, Vite, ESLint, and Vitest. Install them with `npm install` inside `web/`.
- Android: Gradle dependencies defined in `android/Fyre/gradle/libs.versions.toml` and `android/Fyre/app/build.gradle.kts`, including Jetpack Compose, Navigation Compose, DataStore, Coil, Gson, OkHttp, Media3, WorkManager, and Accompanist Permissions. Gradle downloads them automatically with `./gradlew assembleRelease` or `./gradlew testDebugUnitTest`.
- iOS: no external libraries are currently declared in the `Podfile`.
- Appwrite backend: functions use JavaScript ES Modules and standard runtime APIs.

See each version-specific README for platform details.

### Admin view

Admin mode uses the accounts configured in the Appwrite backend.
