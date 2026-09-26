# Fyre Web

React and TypeScript client built with Vite.

## Requirements

- Node.js 22.13+ (22.x), or Node.js 24 or newer;
- npm; the lockfile is the reproducible dependency source.

## Setup

First [configure your own Appwrite backend](../appwrite/README.md#one-time-appwrite-setup). Then, from the repository root:

```sh
cd web
cp .env.example .env.local
npm ci
npm run dev
```

Replace every required placeholder in `.env.local`. The app shows an explanatory screen when configuration is missing or invalid; local development also shows setup instructions.

City search uses Photon.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run check` | Lint, tests, and production build |
| `npm run preview` | Local production-build preview |

See the [main README](../README.md), [Appwrite setup](../appwrite/README.md), and [CI workflow](../.github/workflows/ci.yml).

---

## Italiano

Client React e TypeScript costruito con Vite.

### Requisiti

- Node.js 22.13+ (serie 22), oppure Node.js 24 o successivo;
- npm; il lockfile è la fonte riproducibile delle dipendenze.

### Avvio

Prima [configurare un proprio backend Appwrite](../appwrite/README.md#configurazione-iniziale-su-appwrite). Poi, dalla root del repository:

```sh
cd web
cp .env.example .env.local
npm ci
npm run dev
```

Sostituire tutti i placeholder obbligatori in `.env.local`. L'app mostra una schermata esplicativa se la configurazione è mancante o non valida; in sviluppo locale mostra anche le istruzioni di configurazione.

La ricerca delle città usa Photon.

### Comandi

| Comando | Scopo |
| --- | --- |
| `npm run dev` | Server di sviluppo |
| `npm run check` | Lint, test e build di produzione |
| `npm run preview` | Anteprima locale della build di produzione |

Consultare il [README principale](../README.md#italiano), la [configurazione Appwrite](../appwrite/README.md#italiano) e la [CI](../.github/workflows/ci.yml).
