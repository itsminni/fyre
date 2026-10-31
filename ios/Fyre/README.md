# Fyre iOS

SwiftUI app with an iOS 17 deployment target.

## Requirements

- Xcode 26.2 or newer, including the iOS 26 SDK;
- an iOS simulator or physical device.

The app targets iOS 17, but building it requires the newer SDK for the conditionally enabled iOS 26 APIs. The shared scheme uses Debug for Run and Release for Archive and Profile.

## Offline demo

Open `Fyre.xcodeproj`, choose the shared **FyreDemo** scheme and run on an iOS simulator or device. No `Config.plist` or Appwrite project is needed. The **Demo** build configuration uses `minni.Fyre.demo`, displays **Fyre Demo**, excludes the runtime configuration and disables Appwrite loading, APNs registration and shared realtime.

The fictional profile is complete. Discovery/matches, paginated chat with attachments, profile editing, the two-event catalog, registration/cancellation and event administration run in memory. **Reset demo** restores the data and navigation. The connected app keeps the **Fyre** scheme. Settings and secure caches remain separate from the demo installation.

```sh
xcodebuild build -project Fyre.xcodeproj -scheme FyreDemo \
  -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO
```

The demo scheme selects `OfflineDemoBackendTests` and `OfflineDemoUITests` for Test. It requires full Xcode and an installed simulator runtime; Command Line Tools alone can check Swift syntax and the Foundation backend, but cannot build the iOS app.

## Setup

From the repository root:

```sh
cd ios/Fyre
cp Fyre/Config.example.plist Fyre/Config.plist
open Fyre.xcodeproj
```

Replace the required public Appwrite resource placeholders. The attachments bucket, admin function, and direct-function domains may stay empty when their features are unused. Select the shared `Fyre` scheme and a simulator or device.

`Config.plist` is ignored by Git but bundled with the app. It must contain public client configuration only.

Without the local file, the app reports that the backend is unavailable without aborting startup. Unit tests use synthetic configuration and need no live credentials.

## Structure

- [`Fyre/`](Fyre/): application and UI;
- [`Fyre/Auth/`](Fyre/Auth/): authentication, Appwrite, and realtime;
- [`Fyre/data/`](Fyre/data/): contracts and services;
- [`FyreTests/`](FyreTests/): unit tests.

## Tests

Run both `FyreTests` and `FyreUITests` from the shared `Fyre` scheme. [CI](../../.github/workflows/ci.yml) selects an available simulator and uses normal ad-hoc signing for Keychain verification.

The UI target checks history scrolling, retry, and the composer with the largest accessibility text size and keyboard, using an offline fixture enabled only in Debug. Both targets run in CI. Message identity cases are shared with the backend in `shared/contracts/fixtures/message-identity.json`.

See the [main README](../../README.md) and [Appwrite setup](../../appwrite/README.md).

---

## Italiano

App SwiftUI con deployment target iOS 17.

### Requisiti

- Xcode 26.2 o successivo, con SDK iOS 26;
- un simulatore iOS o dispositivo fisico.

L'app mantiene iOS 17 come deployment target, ma per compilarla occorre il nuovo SDK per le API iOS 26 abilitate condizionalmente. Lo schema condiviso usa Debug per Run e Release per Archive e Profile.

### Demo offline

Aprire `Fyre.xcodeproj`, selezionare lo schema condiviso **FyreDemo** e avviare un simulatore o dispositivo. Non servono `Config.plist` né un progetto Appwrite. La configurazione **Demo** usa il bundle `minni.Fyre.demo`, il nome **Fyre Demo**, esclude la configurazione live e disabilita Appwrite, APNs e realtime remoto.

Profilo completo fittizio, discovery/match, chat paginata con allegati, modifica profilo, due eventi, iscrizioni/annullamento e amministrazione funzionano in memoria. **Ripristina demo** ripristina dati e navigazione. Il client connesso mantiene lo schema **Fyre**; impostazioni e cache sicure delle due installazioni restano separate.

```sh
xcodebuild build -project Fyre.xcodeproj -scheme FyreDemo \
  -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO
```

Lo schema demo seleziona `OfflineDemoBackendTests` e `OfflineDemoUITests`. Per build e test dell’interfaccia servono Xcode completo e un runtime simulatore; i soli Command Line Tools consentono le verifiche di sintassi Swift e del backend Foundation.

### Avvio

Dalla root del repository:

```sh
cd ios/Fyre
cp Fyre/Config.example.plist Fyre/Config.plist
open Fyre.xcodeproj
```

Sostituire i placeholder obbligatori delle risorse pubbliche Appwrite. Il bucket degli allegati, la funzione amministrativa e i domini diretti delle funzioni possono restare vuoti quando le relative funzionalità non vengono usate. Selezionare lo schema condiviso `Fyre` e un simulatore o dispositivo.

`Config.plist` è ignorato da Git ma incluso nel bundle. Deve contenere soltanto configurazione pubblica del client.

Senza il file locale l'app segnala il backend come non disponibile senza interrompere l'avvio. I test unitari usano una configurazione sintetica e non richiedono credenziali live.

### Struttura

- [`Fyre/`](Fyre/): applicazione e UI;
- [`Fyre/Auth/`](Fyre/Auth/): autenticazione, Appwrite e realtime;
- [`Fyre/data/`](Fyre/data/): contratti e servizi;
- [`FyreTests/`](FyreTests/): test unitari.

### Test

Eseguire i target `FyreTests` e `FyreUITests` dallo schema condiviso `Fyre`. La [CI](../../.github/workflows/ci.yml) seleziona un simulatore disponibile e usa la normale firma ad-hoc necessaria a verificare il Keychain.

Verificare scorrimento e riprova della cronologia, oltre al composer con testo accessibile massimo e tastiera, tramite le fixture offline disponibili soltanto in Debug. Eseguire entrambi i target in CI. Condividere con il backend i casi di identità messaggio in `shared/contracts/fixtures/message-identity.json`.

Consultare anche il [README principale](../../README.md#italiano) e la [configurazione Appwrite](../../appwrite/README.md#italiano).
