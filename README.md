# Fyre

## Italiano

Fyre e un progetto multi-piattaforma per dating, social discovery, messaggistica ed eventi. Il repository contiene tre client applicativi e un backend basato su Appwrite:

- app iOS in SwiftUI;
- app Android in Jetpack Compose;
- prototipo web in React + TypeScript con Vite;
- funzioni Appwrite in JavaScript per la logica server-side.

Le funzionalita principali includono registrazione e login, completamento del profilo, scoperta di profili compatibili, swipe con like o skip, creazione del match solo in caso di interesse reciproco, chat tra utenti abbinati, gestione delle relazioni, iscrizione agli eventi, lista d'attesa, strumenti admin per gli eventi e notifiche locali o realtime dove supportate dal client.

### Struttura del repository

- `ios/`: sorgenti dell'app iOS, progetto Xcode e test.
- `android/`: sorgenti dell'app Android e progetto Gradle.
- `web/`: prototipo web React + TypeScript.
- `functions/`: funzioni cloud Appwrite usate dal dominio applicativo.
- `shared/`: contratti condivisi tra funzioni e client.
- `docs/`: materiali di supporto, note e prompt di progetto.

### Quick start generale

#### iOS

1. Aprire `ios/Fyre/Fyre.xcodeproj` in Xcode.
2. Selezionare lo schema `Fyre`.
3. Avviare l'app su simulatore o dispositivo.

Documentazione specifica: `ios/README.md`.

#### Android

1. Entrare nella cartella `android/Fyre`.
2. Eseguire `./gradlew assembleDebug`.
3. Aprire il progetto in Android Studio o installare l'APK generato su un emulatore/dispositivo.

Documentazione specifica: `android/Fyre/README.md`.

#### Web

1. Entrare nella cartella `web`.
2. Eseguire `npm install`.
3. Copiare `.env.example` in `.env.local`.
4. Eseguire `npm run dev`.

Documentazione specifica: `web/README.md`.

#### Backend Appwrite

Le funzioni backend si trovano in `functions/` e gestiscono discovery, swipe, match, chat, relazioni ed eventi. Ogni funzione e pensata per essere distribuita su Appwrite con le variabili d'ambiente indicate nei client e nei sorgenti delle funzioni.

Documentazione specifica: `functions/README.md`.

### Librerie esterne e installazione

Il progetto utilizza librerie esterne diverse in base alla piattaforma:

- Web: dipendenze npm definite in `web/package.json`, tra cui React, React Router, Appwrite SDK, TypeScript, Vite, ESLint e Vitest. Si installano con `npm install` dentro `web/`.
- Android: dipendenze Gradle definite in `android/Fyre/gradle/libs.versions.toml` e `android/Fyre/app/build.gradle.kts`, tra cui Jetpack Compose, Navigation Compose, DataStore, Coil, Gson, OkHttp, Media3, WorkManager e Accompanist Permissions. Gradle le scarica automaticamente con `./gradlew assembleDebug` o `./gradlew testDebugUnitTest`.
- iOS: Non sono dichiarate librerie esterne nel `Podfile`.
- Backend Appwrite: le funzioni usano JavaScript ES Modules e API runtime standard.

Per i dettagli specifici vedere i README delle singole versioni.

## English

Fyre is a multi-platform project for dating, social discovery, messaging, and event participation. The repository contains three application clients and an Appwrite-based backend:

- iOS app built with SwiftUI;
- Android app built with Jetpack Compose;
- web prototype built with React + TypeScript and Vite;
- JavaScript Appwrite functions for server-side domain logic.

The main features include sign-up and login, profile completion, compatible profile discovery, swipe actions with like or skip, match creation only after mutual interest, chat between matched users, relationship management, event registration, waitlist handling, event admin tools, and local or realtime notifications where supported by the client.

### Repository structure

- `ios/`: iOS app source, Xcode project, and tests.
- `android/`: Android app source and Gradle project.
- `web/`: React + TypeScript web prototype.
- `functions/`: Appwrite cloud functions used by the app domain.
- `shared/`: shared contracts used by functions and clients.
- `docs/`: supporting material, notes, and project prompts.

### General quick start

#### iOS

1. Open `ios/Fyre/Fyre.xcodeproj` in Xcode.
2. Select the `Fyre` scheme.
3. Run the app on a simulator or device.

Specific documentation: `ios/README.md`.

#### Android

1. Go to `android/Fyre`.
2. Run `./gradlew assembleDebug`.
3. Open the project in Android Studio or install the generated APK on an emulator/device.

Specific documentation: `android/Fyre/README.md`.

#### Web

1. Go to `web`.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local`.
4. Run `npm run dev`.

Specific documentation: `web/README.md`.

#### Appwrite backend

Backend functions are located in `functions/` and handle discovery, swipes, matches, chat, relationships, and events. Each function is intended to be deployed on Appwrite with the environment variables referenced by the clients and function source files.

Specific documentation: `functions/README.md`.

### External libraries and installation

The project uses different external libraries depending on the platform:

- Web: npm dependencies defined in `web/package.json`, including React, React Router, Appwrite SDK, TypeScript, Vite, ESLint, and Vitest. Install them with `npm install` inside `web/`.
- Android: Gradle dependencies defined in `android/Fyre/gradle/libs.versions.toml` and `android/Fyre/app/build.gradle.kts`, including Jetpack Compose, Navigation Compose, DataStore, Coil, Gson, OkHttp, Media3, WorkManager, and Accompanist Permissions. Gradle downloads them automatically with `./gradlew assembleDebug` or `./gradlew testDebugUnitTest`.
- iOS: no external libraries are currently declared in the `Podfile`.
- Appwrite backend: functions use JavaScript ES Modules and standard runtime APIs.

See each version-specific README for platform details.
