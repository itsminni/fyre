# Fyre Appwrite Functions

## Italiano

Questa cartella contiene le funzioni Appwrite usate dal backend di Fyre. Le funzioni centralizzano la logica piu delicata del progetto, in modo che i client iOS, Android e web condividano le stesse regole applicative.

### Funzioni disponibili

- `discoverprofiles`: restituisce profili compatibili per la discovery.
- `recordswipe`: registra like o skip e crea un match quando l'interesse e reciproco.
- `createorgetthread`: crea o recupera una conversazione tra utenti.
- `sendmessage`: invia messaggi e aggiorna la preview del thread.
- `managerelationship`: gestisce archiviazione, unmatch o blocco.
- `registerforevent`: registra l'utente a un evento o alla lista d'attesa.
- `canceleventregistration`: annulla un'iscrizione e promuove utenti dalla lista d'attesa quando possibile.
- `manageeventadmin`: espone le operazioni amministrative per eventi e partecipanti.

### Quick start

1. Entrare nella cartella della funzione interessata:

   ```bash
   cd functions/discoverprofiles
   ```

2. Verificare che il runtime Appwrite usi Node.js con moduli ES.

3. Configurare le variabili d'ambiente richieste dalla funzione, ad esempio endpoint, project id, database id, table id, bucket id e function id.

4. Distribuire la funzione tramite Appwrite Console o Appwrite CLI.

### Librerie esterne

Le funzioni non dichiarano librerie npm esterne nei rispettivi `package.json`. Usano JavaScript ES Modules, `fetch`, API standard del runtime Node/Appwrite e helper locali presenti nei file sorgente.

Di conseguenza non e necessario eseguire `npm install` per le funzioni nello stato attuale. Se in futuro venissero aggiunte dipendenze, dovranno essere dichiarate nel `package.json` della funzione interessata e installate o incluse secondo il flusso di deploy Appwrite.

### Test

Alcune funzioni includono file `*.test.mjs`. I test possono essere eseguiti con Node.js dalla rispettiva cartella funzione quando non richiedono servizi esterni.

## English

This folder contains the Appwrite functions used by the Fyre backend. The functions centralize the most sensitive project logic so the iOS, Android, and web clients share the same application rules.

### Available functions

- `discoverprofiles`: returns compatible profiles for discovery.
- `recordswipe`: records like or skip decisions and creates a match when interest is mutual.
- `createorgetthread`: creates or retrieves a conversation between users.
- `sendmessage`: sends messages and updates the thread preview.
- `managerelationship`: manages archive, unmatch, or block actions.
- `registerforevent`: registers the user for an event or waitlist.
- `canceleventregistration`: cancels a registration and promotes waitlisted users when possible.
- `manageeventadmin`: exposes admin operations for events and participants.

### Quick start

1. Go to the target function folder:

   ```bash
   cd functions/discoverprofiles
   ```

2. Make sure the Appwrite runtime uses Node.js with ES modules.

3. Configure the environment variables required by the function, such as endpoint, project id, database id, table ids, bucket ids, and function ids.

4. Deploy the function through the Appwrite Console or Appwrite CLI.

### External libraries

The functions do not declare external npm libraries in their `package.json` files. They use JavaScript ES Modules, `fetch`, standard Node/Appwrite runtime APIs, and local helpers included in the source files.

As a result, `npm install` is not required for the functions in their current state. If dependencies are added later, they should be declared in the related function `package.json` and installed or bundled according to the Appwrite deployment flow.

### Tests

Some functions include `*.test.mjs` files. Tests can be run with Node.js from the related function folder when they do not require external services.
