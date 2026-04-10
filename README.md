# Fyre

Fyre is a multi-client dating project with:
- iOS app in SwiftUI
- Android app in Jetpack Compose
- Web prototype in React + TypeScript (Vite)

The product focus is profile discovery, messaging, event participation, and account management.

## Repository structure

- `ios/`: Apple app source, Xcode project, tests.
- `android/`: Android app source and Gradle project.
- `web/`: React + TypeScript frontend prototype (for now).
- `functions/`: backend cloud functions used by the app domain.
- `docs/`: notes and project support material.

## Quick start

### iOS
1. Open `ios/Fyre/Fyre.xcodeproj` in Xcode.
2. Select scheme `Fyre` and a simulator/device.
3. Run the app.

More details about iOS architecture and flows: `ios/README.md`.

### Android
1. `cd android/Fyre`
2. `./gradlew assembleDebug`

### Web
1. `cd web`
2. `npm install`
3. `npm run dev`
