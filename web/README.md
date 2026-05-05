# Fyre Web

## Italiano

Questa cartella contiene il client web di Fyre, sviluppato con React, TypeScript e Vite.

### Requisiti

- Node.js recente.
- npm.

### Quick start

1. Entrare nella cartella web:

   ```bash
   cd web
   ```

2. Installare le dipendenze:

   ```bash
   npm install
   ```

3. Avviare il server di sviluppo:

   ```bash
   npm run dev
   ```

4. Creare una build di produzione:

   ```bash
   npm run build
   ```

### Configurazione Appwrite e geocoding

Nel progetto Appwrite sono registrate le platform web per gli hostname usati in sviluppo:

- `localhost`
- `127.0.0.1`

L'autocomplete e la validazione città usano Photon con endpoint pubblico di default. Non servono chiavi. Per usare un endpoint Photon diverso:

```bash
VITE_PHOTON_BASE_URL=https://example.com npm run build
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

### Struttura principale

- `src/App.tsx`: routing principale.
- `src/context/AppContext.tsx`: stato applicativo e operazioni dominio.
- `src/services/appwriteService.ts`: integrazione con Appwrite.
- `src/pages`: pagine principali dell'app.
- `src/components`: componenti condivisi.
- `src/types/models.ts`: modelli e helper di dominio.

## English

This folder contains the Fyre web client, built with React, TypeScript, and Vite.

### Requirements

- A recent Node.js version.
- npm.

### Quick start

1. Go to the web folder:

   ```bash
   cd web
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the development server:

   ```bash
   npm run dev
   ```

4. Create a production build:

   ```bash
   npm run build
   ```

### Appwrite and geocoding configuration

The Appwrite project includes web platforms for the hostnames used during development:

- `localhost`
- `127.0.0.1`

City autocomplete and validation use Photon's public endpoint by default. No key is required. To use a different Photon endpoint:

```bash
VITE_PHOTON_BASE_URL=https://example.com npm run build
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

### Main structure

- `src/App.tsx`: main routing.
- `src/context/AppContext.tsx`: app state and domain operations.
- `src/services/appwriteService.ts`: Appwrite integration.
- `src/pages`: main app pages.
- `src/components`: shared components.
- `src/types/models.ts`: domain models and helpers.
