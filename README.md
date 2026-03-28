# Fyre

Fyre is a mobile project with two clients:
- iOS in SwiftUI
- Android in Jetpack Compose

The repository now also contains a web frontend prototype built with React + TypeScript (Vite-style structure) that recreates the visible iOS flows using only client-side state and mock services.

The goal is to build an app focused on profile discovery, chat, and account management, starting from a local foundation and gradually moving to real backend and database services.

Repository structure
- `ios/`: iOS app and SwiftUI components.
- `android/`: Android app and Compose navigation.
- `web/`: web frontend in TypeScript (React), mock-only (no real backend calls).
- `backend/`: placeholder area for future services/APIs.
- `docs/`: project materials and support notes (prompts and planning).

Documentation
- `docs/` contains planning materials and useful notes, including AI prompts used during exploration.

Web frontend notes
- The web app is intentionally frontend-only.
- No server, no database, no real API integration is implemented.
- Backend-dependent flows are simulated via local state, localStorage persistence, and mock services.
- Future backend integration points are marked in `web/src/services/mockBackend.ts`.
- Local user management for testing is available in login/account screens.
- Demo users can be injected locally from UI with default password: `DEMO_PASSWORD_REDACTED`.

Web run commands
1. `cd web`
2. `npm install`
3. `npm run dev`
