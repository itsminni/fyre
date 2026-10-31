# Fyre offline demo

[English](#english) · [Italiano](#italiano)

## English

The offline demo lets you explore Fyre on web, Android and iOS without an Appwrite account or backend configuration.

### Features

- Browse three discovery profiles, like or skip them, and open a chat after a match.
- Send messages and local attachments, and browse a conversation with 120 paginated messages.
- Edit the profile and its photos.
- Register for an event, cancel a registration, and try the event administration controls.

### Getting started

Switch to the `demo` branch before running the commands:

```sh
git switch demo
```

Run each platform's command block from the repository root. The demos use the same development tools as the connected clients and they do not need Appwrite configuration files or resource IDs.

#### Web

Requires Node.js and npm. See the [web requirements](web/README.md#requirements) for supported versions.

```sh
cd web
npm ci
npm run dev:demo
```

Open the local URL printed by Vite. To build and preview the static version, run the following commands from `web/`:

```sh
npm run build:demo
npm run preview:demo
```

The generated site is in `web/dist-demo/`.

#### Android

Requires JDK 21 and Android SDK Platform 37. Use Android Studio's **demo** build variant, or build from the terminal:

```sh
cd android/Fyre
./gradlew assembleDemo
```

The APK is `android/Fyre/app/build/outputs/apk/demo/app-demo.apk`. To install it on a connected emulator or device, run `./gradlew installDemo` from `android/Fyre/`.

#### iOS

Requires full Xcode 26.2 or newer, including the iOS SDK. The app supports iOS 17 and later.

```sh
open ios/Fyre/Fyre.xcodeproj
```

Select the shared **FyreDemo** scheme, choose a simulator or device, and run the app.

### Data and reset

Each demo keeps its fictional data locally in memory.

Use **Reset demo** to restore the sample data before another presentation.

### Checks

Web: `npm run test:demo` from `web/`. Android: `./gradlew -PfyreUiDemo=true testDemoUnitTest connectedDemoAndroidTest` from `android/Fyre/`, with an emulator connected. iOS: select **FyreDemo → Test** in full Xcode. The branch CI checks all three platforms; iOS builds and UI tests require Xcode and cannot run with Command Line Tools alone.

---

## Italiano

La demo offline permette di esplorare Fyre su web, Android e iOS senza un account Appwrite o una configurazione del backend.

### Funzionalità

- Esplorare tre profili discovery, mettere un like o saltarli e aprire una chat dopo un match.
- Inviare messaggi e allegati locali ed esplorare una conversazione con 120 messaggi paginati.
- Modificare il profilo e le sue foto.
- Iscriversi a un evento, annullare l'iscrizione e provare i controlli di amministrazione degli eventi.

### Avvio

Passare al branch `demo` prima di eseguire i comandi:

```sh
git switch demo
```

Eseguire il blocco di comandi di ciascuna piattaforma dalla root del repository. Le demo usano gli stessi strumenti di sviluppo dei client connessi e non richiedono file di configurazione Appwrite né ID delle risorse.

#### Web

Richiede Node.js e npm. Le versioni supportate sono indicate nei [requisiti web](web/README.md#requisiti).

```sh
cd web
npm ci
npm run dev:demo
```

Aprire l’indirizzo locale mostrato da Vite. Per compilare e visualizzare la versione statica, eseguire questi comandi da `web/`:

```sh
npm run build:demo
npm run preview:demo
```

Il sito generato si trova in `web/dist-demo/`.

#### Android

Richiede JDK 21 e Android SDK Platform 37. Selezionare la variante **demo** in Android Studio oppure compilare dal terminale:

```sh
cd android/Fyre
./gradlew assembleDemo
```

L'APK si trova in `android/Fyre/app/build/outputs/apk/demo/app-demo.apk`. Per installarlo su un emulatore o dispositivo collegato, eseguire `./gradlew installDemo` da `android/Fyre/`.

#### iOS

Richiede Xcode completo, versione 26.2 o successiva, con l'SDK iOS. L'app supporta iOS 17 e versioni successive.

```sh
open ios/Fyre/Fyre.xcodeproj
```

Selezionare lo schema condiviso **FyreDemo**, scegliere un simulatore o dispositivo e avviare l'app.

### Dati e ripristino

Ogni demo conserva i propri dati fittizi localmente in memoria.

Usare **Ripristina demo** per ripristinare i dati di esempio prima di un’altra presentazione.

### Verifiche

Web: `npm run test:demo` da `web/`. Android: `./gradlew -PfyreUiDemo=true testDemoUnitTest connectedDemoAndroidTest` da `android/Fyre/`, con un emulatore collegato. iOS: selezionare **FyreDemo → Test** in Xcode completo. La CI del branch verifica tutte e tre le piattaforme; build e test UI iOS richiedono Xcode e non sono eseguibili con i soli Command Line Tools.
