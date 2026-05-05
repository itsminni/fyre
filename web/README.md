# Fyre Web

## Italiano

Questa cartella contiene il prototipo web di Fyre, sviluppato con React, TypeScript e Vite. Il client web include autenticazione, setup profilo, discovery con swipe, match, chat, eventi, account, preferenze e modalita locale/mock quando la configurazione Appwrite non e disponibile.

### Requisiti

- Node.js recente.
- npm.
- File `.env.local` per usare il backend Appwrite reale.

### Quick start

1. Entrare nella cartella web:

   ```bash
   cd web
   ```

2. Installare le dipendenze:

   ```bash
   npm install
   ```

3. Creare il file di configurazione locale:

   ```bash
   cp .env.example .env.local
   ```

4. Avviare il server di sviluppo:

   ```bash
   npm run dev
   ```

5. Creare una build di produzione:

   ```bash
   npm run build
   ```

### Librerie esterne

Le librerie esterne sono definite in `package.json` e installate tramite npm:

- `react` e `react-dom` per l'interfaccia utente.
- `react-router-dom` per il routing.
- `appwrite` per l'integrazione con il backend Appwrite.
- `typescript` per type checking e compilazione.
- `vite` e `@vitejs/plugin-react` per sviluppo e build.
- `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks` e `eslint-plugin-react-refresh` per linting.
- `vitest` per test automatici.
- `@types/react` e `@types/react-dom` per i tipi TypeScript.

Per installarle:

```bash
npm install
```

Per eseguire tutti i controlli web:

```bash
npm run check
```

### Configurazione backend

Se `VITE_USE_APPWRITE_BACKEND=true` e i valori `VITE_APPWRITE_*` necessari sono presenti, il web usa il backend Appwrite. Se i valori backend non sono configurati, il client puo usare dati locali o mock per il prototipo.

### Struttura principale

- `src/App.tsx`: routing principale.
- `src/context/AppContext.tsx`: stato applicativo e operazioni dominio.
- `src/services/appwriteService.ts`: integrazione con Appwrite.
- `src/services/mockBackend.ts`: backend locale/mock.
- `src/pages`: pagine principali dell'app.
- `src/components`: componenti condivisi.
- `src/types/models.ts`: modelli e helper di dominio.

## English

This folder contains the Fyre web prototype, built with React, TypeScript, and Vite. The web client includes authentication, profile setup, swipe-based discovery, matches, chat, events, account management, preferences, and a local/mock mode when Appwrite configuration is not available.

### Requirements

- A recent Node.js version.
- npm.
- `.env.local` file to use the real Appwrite backend.

### Quick start

1. Go to the web folder:

   ```bash
   cd web
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create the local configuration file:

   ```bash
   cp .env.example .env.local
   ```

4. Start the development server:

   ```bash
   npm run dev
   ```

5. Create a production build:

   ```bash
   npm run build
   ```

### External libraries

External libraries are defined in `package.json` and installed through npm:

- `react` and `react-dom` for the user interface.
- `react-router-dom` for routing.
- `appwrite` for Appwrite backend integration.
- `typescript` for type checking and compilation.
- `vite` and `@vitejs/plugin-react` for development and builds.
- `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, and `eslint-plugin-react-refresh` for linting.
- `vitest` for automated tests.
- `@types/react` and `@types/react-dom` for TypeScript types.

Install them with:

```bash
npm install
```

Run all web checks with:

```bash
npm run check
```

### Backend configuration

When `VITE_USE_APPWRITE_BACKEND=true` and the required `VITE_APPWRITE_*` values are present, the web app uses the Appwrite backend. If backend values are not configured, the client can use local/mock data for prototyping.

### Main structure

- `src/App.tsx`: main routing.
- `src/context/AppContext.tsx`: app state and domain operations.
- `src/services/appwriteService.ts`: Appwrite integration.
- `src/services/mockBackend.ts`: local/mock backend.
- `src/pages`: main app pages.
- `src/components`: shared components.
- `src/types/models.ts`: domain models and helpers.
