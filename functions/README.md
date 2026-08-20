# Fyre Appwrite functions

The functions centralize rules that must not be trusted to the three clients.

## Inventory

| Function | Responsibility |
| --- | --- |
| `manageprofile` | Profile bound to the verified account |
| `discoverprofiles` | Filtered discovery and temporary avatar URLs |
| `recordswipe` | Transactional swipes, matches, and relationship state |
| `createorgetthread` | Pair-thread verification or creation |
| `sendmessage` | Validated messages, replies, and attachments |
| `managerelationship` | Archive, unmatch, and block actions |
| `registerforevent` | Registration or waitlist entry |
| `canceleventregistration` | Cancellation and waitlist promotion |
| `manageeventadmin` | Events and participants with consistent ACLs |

Runtime, minimum scopes, variables, authenticated execution, and `logging: false` are defined in [`appwrite/functions.json`](../appwrite/functions.json). All functions use Node.js 22.

## Security rules

- Every function verifies `x-appwrite-user-jwt` through Account before trusting identity. Client-supplied identity fields are not authoritative.
- Server operations accept only Appwrite's injected `x-appwrite-key`; there are no static API-key fallbacks.
- Avatars remain owner-only. Authorized functions issue short-lived File Token URLs after access checks and never log them.
- `sendmessage` accepts sender-owned files from the attachments bucket, reads metadata from Appwrite, and confines replies to the same thread.

## Pagination

- `discoverprofiles` accepts `profileCursor`, scans stable windows of at most 400 profiles, returns at most 40 results, and provides `nextCursor`.
- `manageeventadmin` accepts `participantLimit` from 1 to 100 and `participantCursor`. Mutations fail closed above the 1,000-active-registration operational bound.

## Tests and deployment

From the repository root:

```sh
npm --prefix functions test
```

Use the project-validated deployment command documented in the [Appwrite guide](../appwrite/README.md#deployment), rather than configuring functions individually.

---

## Italiano

Le funzioni centralizzano le regole che non possono essere affidate ai tre client.

### Inventario

| Funzione | Responsabilità |
| --- | --- |
| `manageprofile` | Profilo legato all'account verificato |
| `discoverprofiles` | Discovery filtrata e URL temporanei degli avatar |
| `recordswipe` | Swipe, match e relazioni transazionali |
| `createorgetthread` | Verifica o creazione del thread della coppia |
| `sendmessage` | Messaggi, risposte e allegati convalidati |
| `managerelationship` | Archiviazione, unmatch e blocco |
| `registerforevent` | Iscrizione o ingresso in lista d'attesa |
| `canceleventregistration` | Annullamento e promozione dalla lista d'attesa |
| `manageeventadmin` | Eventi e partecipanti con ACL coerenti |

Runtime, scope minimi, variabili, esecuzione autenticata e `logging: false` sono definiti in [`appwrite/functions.json`](../appwrite/functions.json). Tutte le funzioni usano Node.js 22.

### Regole di sicurezza

- Ogni funzione verifica `x-appwrite-user-jwt` tramite Account prima di fidarsi dell'identità. I campi identità inviati dal client non sono autorevoli.
- Le operazioni server accettano soltanto `x-appwrite-key`, iniettata da Appwrite; non esistono fallback con API key statiche.
- Gli avatar restano accessibili soltanto al proprietario. Le funzioni autorizzate generano URL File Token brevi dopo i controlli e non li registrano nei log.
- `sendmessage` accetta file posseduti dal mittente nel bucket degli allegati, legge i metadati da Appwrite e limita le risposte allo stesso thread.

### Paginazione

- `discoverprofiles` accetta `profileCursor`, scansiona finestre stabili di massimo 400 profili, restituisce al massimo 40 risultati e fornisce `nextCursor`.
- `manageeventadmin` accetta `participantLimit` da 1 a 100 e `participantCursor`. Le mutazioni falliscono in modo chiuso oltre il limite operativo di 1.000 iscrizioni attive.

### Test e distribuzione

Dalla root del repository:

```sh
npm --prefix functions test
```

Usare il comando con verifica del progetto documentato nella [guida Appwrite](../appwrite/README.md#distribuzione), invece di configurare manualmente le singole funzioni.
