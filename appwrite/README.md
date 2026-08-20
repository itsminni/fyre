# Appwrite infrastructure

This directory is the reproducible source for Fyre's Appwrite backend. Tracked files contain neutral logical IDs; the live endpoint, project ID, and mapped resource IDs belong in the ignored root `.env` file.

## Tracked resources

| File | Contents |
| --- | --- |
| [`tables-db.json`](tables-db.json) | TablesDB database |
| [`tables.json`](tables.json) | Nine row-secured tables, columns, and indexes |
| [`buckets.json`](buckets.json) | Two file-secured Storage buckets |
| [`functions.json`](functions.json) | Nine authenticated Node.js 22 functions |
| [`../appwrite.config.example.json`](../appwrite.config.example.json) | Neutral multi-file CLI configuration |

## Requirements

- Node.js 22 for function tests;
- Ruby for configuration generation and validation;
- Appwrite CLI 25, authenticated to a project that can host nine functions and two buckets.

On macOS, install the CLI with:

```sh
brew install appwrite
```

## One-time Appwrite setup

1. Create or select a project intended for this demo.
2. Enable email and password authentication.
3. Register the client platforms:
   - Web: `localhost`, `127.0.0.1`, and any public host used for the demo;
   - Android: package `minni.fyre`;
   - Apple: bundle ID `minni.Fyre`.
4. Log in with `appwrite login`. For self-hosted Appwrite, pass its endpoint to the login command.

The manifests create the database resources and functions; they do not create Appwrite accounts or client platforms.

## Local configuration

Copy the template, then fill the ignored file with the public endpoint, project ID, and resource IDs for the selected project:

```sh
cp .env.example .env
ruby scripts/prepare-appwrite-config.rb --check .env
ruby scripts/prepare-appwrite-config.rb .env
```

The last command generates ignored CLI manifests and per-function environment files. Event administrators are optional and can be configured with verified account IDs or emails in `APPWRITE_EVENT_ADMIN_USER_IDS` and `APPWRITE_EVENT_ADMIN_EMAILS`.

Prepare the ignored client files with the same public endpoint and IDs:

```sh
cp web/.env.example web/.env.local
cp android/Fyre/local.properties.example android/Fyre/local.properties
cp ios/Fyre/Fyre/Config.example.plist ios/Fyre/Fyre/Config.plist
```

Set `APPWRITE_BACKEND_ENABLED=true` on Android. Direct function domains are optional because clients can use the Appwrite execution API.

## Deployment

```sh
appwrite push tables
appwrite push buckets
scripts/deploy-appwrite-functions.sh --confirm-project 'EXACT-PROJECT-ID'
```

The deployment script runs tests, validates the target project and configuration, applies function variables and scopes, deploys all nine functions, and keeps production logging disabled.

Tables have no broad permissions and use row security. Published active events receive authenticated-user read access, drafts and inactive events remain private. Profile photos and chat attachments use per-file permissions.

## Demo checklist

- all three client platforms are registered;
- nine tables, two buckets, and nine ready function deployments are present;
- all clients use the same endpoint and resource IDs;
- at least one future `active` event exists with authenticated-user read permission;
- two synthetic accounts and profiles are available to demonstrate discovery, a reciprocal match, and chat.

---

## Italiano

Questa cartella è la fonte riproducibile del backend Appwrite di Fyre. I file tracciati contengono ID logici neutri; endpoint live, project ID e ID delle risorse associate vanno nel file `.env` alla root, ignorato da Git.

### Risorse tracciate

| File | Contenuto |
| --- | --- |
| [`tables-db.json`](tables-db.json) | Database TablesDB |
| [`tables.json`](tables.json) | Nove tabelle con sicurezza per riga, colonne e indici |
| [`buckets.json`](buckets.json) | Due bucket Storage con sicurezza per file |
| [`functions.json`](functions.json) | Nove funzioni Node.js 22 autenticate |
| [`../appwrite.config.example.json`](../appwrite.config.example.json) | Configurazione CLI neutra su più file |

### Requisiti

- Node.js 22 per i test delle funzioni;
- Ruby per generare e validare la configurazione;
- Appwrite CLI 25, autenticata su un progetto che possa ospitare nove funzioni e due bucket.

Su macOS si installa la CLI con:

```sh
brew install appwrite
```

### Configurazione iniziale su Appwrite

1. Creare o selezionare un progetto dedicato alla demo.
2. Abilitare l'autenticazione tramite email e password.
3. Registrare le platform dei client:
   - Web: `localhost`, `127.0.0.1` e l'eventuale host pubblico della demo;
   - Android: package `minni.fyre`;
   - Apple: bundle ID `minni.Fyre`.
4. Accedere con `appwrite login`. Per Appwrite self-hosted, indicare anche il relativo endpoint.

I manifest creano le risorse del database e le funzioni.

### Configurazione locale

Copiare il modello e compilare il file ignorato con endpoint pubblico, project ID e ID delle risorse del progetto scelto:

```sh
cp .env.example .env
ruby scripts/prepare-appwrite-config.rb --check .env
ruby scripts/prepare-appwrite-config.rb .env
```

L'ultimo comando genera i manifest CLI e i file d'ambiente delle funzioni, tutti ignorati. Gli amministratori degli eventi sono opzionali e si configurano con ID account o email verificate in `APPWRITE_EVENT_ADMIN_USER_IDS` e `APPWRITE_EVENT_ADMIN_EMAILS`.

Preparare i file client ignorati usando gli stessi endpoint e ID pubblici:

```sh
cp web/.env.example web/.env.local
cp android/Fyre/local.properties.example android/Fyre/local.properties
cp ios/Fyre/Fyre/Config.example.plist ios/Fyre/Fyre/Config.plist
```

Su Android impostare `APPWRITE_BACKEND_ENABLED=true`. I domini diretti delle funzioni sono opzionali perché i client possono usare l'API di esecuzione Appwrite.

### Distribuzione

```sh
appwrite push tables
appwrite push buckets
scripts/deploy-appwrite-functions.sh --confirm-project 'ID-ESATTO-DEL-PROGETTO'
```

Lo script esegue i test, verifica progetto e configurazione, applica variabili e scope, distribuisce le nove funzioni e mantiene disabilitati i log di produzione. Evitare `--force` finché non sono state controllate tutte le modifiche mostrate.

Le tabelle non hanno permessi generali e usano la sicurezza per riga. Gli eventi attivi pubblicati ricevono il permesso di lettura per gli utenti autenticati, bozze ed eventi inattivi restano privati. Foto profilo e allegati chat usano permessi per file.

### Checklist della demo

- le tre platform client sono registrate;
- sono presenti nove tabelle, due bucket e nove deployment pronti;
- tutti i client usano gli stessi endpoint e ID delle risorse;
- esiste almeno un evento futuro `active` leggibile dagli utenti autenticati;
- esistono due account e profili sintetici per mostrare discovery, match reciproco e chat.
