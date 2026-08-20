# Fyre iOS

SwiftUI app with an iOS 17 deployment target.

## Requirements

- a recent Xcode release with iOS 17 or newer support;
- an iOS simulator or physical device.

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

Run the `FyreTests` target from the shared `Fyre` scheme. [CI](../../.github/workflows/ci.yml) selects an available simulator and uses normal ad-hoc signing for Keychain verification.

See the [main README](../../README.md) and [Appwrite setup](../../appwrite/README.md).

---

## Italiano

App SwiftUI con deployment target iOS 17.

### Requisiti

- una versione recente di Xcode con supporto iOS 17 o successivo;
- un simulatore iOS o dispositivo fisico.

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

Eseguire il target `FyreTests` dallo schema condiviso `Fyre`. La [CI](../../.github/workflows/ci.yml) seleziona un simulatore disponibile e usa la normale firma ad-hoc necessaria a verificare il Keychain.

Consultare anche il [README principale](../../README.md#italiano) e la [configurazione Appwrite](../../appwrite/README.md#italiano).
