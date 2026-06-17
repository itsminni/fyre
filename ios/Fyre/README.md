# Fyre iOS

## Italiano

Questa cartella contiene l'app iOS di Fyre, sviluppata in SwiftUI.

### Requisiti

- Xcode recente con supporto iOS 17 o superiore.
- Simulatore iOS o dispositivo fisico.
- Configurazione Appwrite in `ios/Fyre/Fyre/Config.plist` per usare il backend reale.

### Quick start

1. Aprire `ios/Fyre/Fyre.xcodeproj` in Xcode.
2. Selezionare lo schema `Fyre`.
3. Selezionare un simulatore o un dispositivo.
4. Avviare l'app con Run.

### Architettura

- `FyreApp.swift`: bootstrap dell'app, tema, notifiche e servizi.
- `ContentView.swift`: router principale per autenticazione, setup profilo e app autenticata.
- `MainTabView.swift`: navigazione principale a tab.
- `UserStore.swift`: stato utente, eventi e logica principale.
- `data/AppServices.swift`: registro dei servizi applicativi.
- `data/AppwriteBackendAPI.swift`: adapter verso il backend Appwrite.
- `Auth/AppwriteService.swift`: integrazione Appwrite per auth, profili ed eventi.
- `Auth/AppwriteRealtimeService.swift`: sottoscrizioni realtime per inbox, chat e notifiche.

### Test

Da Xcode si possono eseguire:

- unit test in `ios/Fyre/FyreTests`;
- UI test in `ios/Fyre/FyreUITests`.

## English

This folder contains the Fyre iOS app, built with SwiftUI.

### Requirements

- A recent Xcode version with iOS 17+ support.
- iOS Simulator or a physical device.
- Appwrite configuration in `ios/Fyre/Fyre/Config.plist` to use the real backend.

### Quick start

1. Open `ios/Fyre/Fyre.xcodeproj` in Xcode.
2. Select the `Fyre` scheme.
3. Select a simulator or device.
4. Run the app.

### Architecture

- `FyreApp.swift`: app bootstrap, theme, notifications, and services.
- `ContentView.swift`: root router for authentication, profile setup, and authenticated app state.
- `MainTabView.swift`: main tab navigation.
- `UserStore.swift`: user state, event state, and main app logic.
- `data/AppServices.swift`: app-wide service registry.
- `data/AppwriteBackendAPI.swift`: adapter for the Appwrite backend.
- `Auth/AppwriteService.swift`: Appwrite integration for auth, profiles, and events.
- `Auth/AppwriteRealtimeService.swift`: realtime subscriptions for inbox, chat, and notifications.

### Tests

From Xcode, run:

- unit tests in `ios/Fyre/FyreTests`;
- UI tests in `ios/Fyre/FyreUITests`.
