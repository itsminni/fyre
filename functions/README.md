# Fyre Appwrite functions

The functions centralize rules that must not be trusted to the three clients.

**Two Appwrite Functions** are deployed: `fyre-api` dispatches the nine authenticated operations below; `cleanupattachments` runs hourly without client execution permission. Handler directories remain separate source modules. The API accepts `{ "operation": "manageprofile", "payload": { "action": "reserveUpload" } }`; cleanup is excluded from routing.

## Inventory

| Function | Responsibility |
| --- | --- |
| `manageprofile` | Profile bound to the verified account |
| `discoverprofiles` | Filtered discovery and temporary avatar URLs |
| `recordswipe` | Transactional swipes, matches, and relationship state |
| `createorgetthread` | Pair-thread verification or creation |
| `sendmessage` | Validated messages, replies, and attachments |
| `cleanupattachments` | Scheduled cleanup of reserved chat and profile uploads |
| `managerelationship` | Archive, unmatch, and block actions |
| `registerforevent` | Registration or waitlist entry |
| `canceleventregistration` | Cancellation and waitlist promotion |
| `manageeventadmin` | Events and participants with consistent ACLs |

Runtime, minimum scopes, variables, authenticated execution, and `logging: false` are defined in [`appwrite/functions.json`](../appwrite/functions.json). All functions use Node.js 22.

## Security rules

- Authenticated functions verify `x-appwrite-user-jwt` through Account before trusting identity. Client-supplied identity fields are not authoritative.
- Server operations accept only Appwrite's injected `x-appwrite-key`; there are no static API-key fallbacks.
- Avatars remain owner-only. Authorized functions issue short-lived File Token URLs after access checks and never log them.
- `sendmessage` accepts sender-owned files from the attachments bucket, reads metadata from Appwrite, and confines replies to the same thread.

## Tests

From the repository root:

```sh
npm --prefix functions test
```

---

## Italiano

Le funzioni centralizzano le regole che non possono essere affidate ai tre client.

Sono presenti **due Functions Appwrite**: `fyre-api` smista le nove operazioni autenticate elencate sotto; `cleanupattachments` esegue la pulizia ogni ora senza permessi di esecuzione per i client. Le cartelle degli handler rimangono moduli separati. Il router accetta `{ "operation": "manageprofile", "payload": { "action": "reserveUpload" } }`; la pulizia è esclusa dalle rotte.

### Inventario

| Funzione | Responsabilità |
| --- | --- |
| `manageprofile` | Profilo legato all'account verificato |
| `discoverprofiles` | Discovery filtrata e URL temporanei degli avatar |
| `recordswipe` | Swipe, match e relazioni transazionali |
| `createorgetthread` | Verifica o creazione del thread della coppia |
| `sendmessage` | Messaggi, risposte e allegati convalidati |
| `cleanupattachments` | Pulizia periodica degli upload chat e profilo prenotati |
| `managerelationship` | Archiviazione, unmatch e blocco |
| `registerforevent` | Iscrizione o ingresso in lista d'attesa |
| `canceleventregistration` | Annullamento e promozione dalla lista d'attesa |
| `manageeventadmin` | Eventi e partecipanti con ACL coerenti |

Runtime, scope minimi, variabili, esecuzione autenticata e `logging: false` sono definiti in [`appwrite/functions.json`](../appwrite/functions.json). Tutte le funzioni usano Node.js 22.

### Regole di sicurezza

- Le funzioni autenticate verificano `x-appwrite-user-jwt` tramite Account prima di fidarsi dell'identità. I campi identità inviati dal client non sono autorevoli.
- Le operazioni server accettano soltanto `x-appwrite-key`, iniettata da Appwrite; non esistono fallback con API key statiche.
- Gli avatar restano accessibili soltanto al proprietario. Le funzioni autorizzate generano URL File Token brevi dopo i controlli e non li registrano nei log.
- `sendmessage` accetta file posseduti dal mittente nel bucket degli allegati, legge i metadati da Appwrite e limita le risposte allo stesso thread.

### Test

Dalla root del repository:

```sh
npm --prefix functions test
```
