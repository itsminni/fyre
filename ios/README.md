# Fyre iOS

This folder contains the Fyre iOS app (`ios/Fyre`) built with SwiftUI.

## Requirements

- A recent Xcode version with iOS 17+ support
- iOS Simulator or a physical iOS device

## Quick Start

1. Open `ios/Fyre/Fyre.xcodeproj` in Xcode.
2. Select the `Fyre` scheme.
3. Run on a simulator or device.

## Architecture (Overview)

- `FyreApp.swift`: app bootstrap (theme, notifications, online presence heartbeat, dependency injection via environment).
- `ContentView.swift`: root router (auth/main/profile setup flow).
- `MainTabView.swift`: main tab navigation.
- `UserStore.swift`: user/event state and main app business logic.
- `data/AppServices.swift`: app-wide service registry.
- `data/AppwriteBackendAPI.swift`: adapter to Appwrite backend for discover/chat APIs.
- `Auth/AppwriteService.swift`: Appwrite integration (auth, profile, events).
- `Auth/AppwriteRealtimeService.swift`: realtime WebSocket subscriptions for inbox/chat/notifications.

## App Flow

1. **Launch**: `FyreApp` initializes store/router/services.
2. **Root routing**:
   - not authenticated -> `LoginView` / `SignUpView`
   - authenticated with incomplete profile -> `ProfileSetupView`
   - authenticated with complete profile -> `MainTabView`
3. **Main tabs**:
   - Home (`ui/home/SwipeHomeView.swift`): profile discovery and swipes
   - Messages (`ui/messages/*`): inbox and chat detail
   - Events (`ui/events/EventsView.swift`): main event registration and admin tools
   - Account (`ui/account/AccountView.swift`): profile, preferences, security, appearance, notifications

## Backend Configuration

The iOS app loads Appwrite configuration from:

- `ios/Fyre/Fyre/Config.plist`

Main keys include:
- endpoint / project / database
- table IDs (profiles, threads, messages, events, ...)
- function IDs and function domains for server-side operations

## Test

- Unit test: `ios/Fyre/FyreTests`
- UI test: `ios/Fyre/FyreUITests`
