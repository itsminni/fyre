# Verifica Android e demo

Questa revisione riguarda i difetti Android della lista fornita e una demo del progetto scolastico. Web e iOS conservano il lavoro precedente; non sono oggetto di un nuovo audit completo in questa revisione.

## Correzioni

| Punti della lista | Risultato |
| --- | --- |
| 3 | Una galleria vuota rimuove tutte le foto; un avatar vuoto viene rimosso. |
| 5–6 | Upload a blocchi di 5 MiB, avanzamento, annullamento della richiesta HTTP, ripresa dei blocchi già confermati e riconciliazione degli allegati. Il server conserva i file già utilizzati da un messaggio; la pulizia oraria recupera anche upload di profilo abbandonati. |
| 9–10 | Chat in pagine da 50 messaggi; l’inbox legge riepiloghi e conteggi senza scaricare ogni cronologia. Le pagine precedenti restano dopo gli aggiornamenti. |
| 11–12 | Connessione realtime condivisa; riconciliazione dopo la riconnessione e polling a 30/60 secondi, solo durante la visibilità. |
| 14 | Le notifiche locali aprono chat/eventi attraverso un PendingIntent immutabile; sessione, account e accesso alla risorsa vengono verificati prima della navigazione. |
| 15–16 | Discovery caricata per pagine, senza eliminare schede in caso di errore temporaneo. Gli invii conservano la stessa identità durante i retry, riconosciuta anche dal server. |
| 17–18 | Un errore di verifica non viene interpretato come logout. L’avvio mostra una schermata con nuovo tentativo; una configurazione assente non apre un login inutilizzabile. |
| 19 | Anteprima del ritaglio quadrato prima dell’upload, controlli di zoom e posizione accessibili, lettura limitata e decodifica ridimensionata. |
| 20–22 | Validazioni e stati tradotti in UI; errori server grezzi sostituiti da messaggi locali. Visualizzazione eventi nella lingua selezionata e nel fuso del dispositivo; input amministrativo esplicitamente Europe/Rome. Storico tradotto, con annullamento/partecipazione solo se dichiarati dal server. Tema, lingua e icona sono del dispositivo; notifiche, discovery e chat sono separate per account. |
| 23–25 | Logica discovery, protocollo upload e risoluzione delle foto estratti in componenti verificabili. Fixture di identità messaggi condivisa con server/iOS. Test di regressione e test UI della demo su emulatore. |
| 28 | Nessuna metrica live inventata nel repository reale: valori assenti quando il server non li fornisce. I dati fittizi sono confinati alla demo esplicita. |

## Limiti mantenuti espliciti

- **13:** notifiche remote Android con app chiusa richiedono un provider FCM e un percorso di invio server. Questa integrazione non è presente; le notifiche attuali sono locali/realtime e promemoria WorkManager. La demo offline non dimostra consegna remota.
- **23–24:** l’estrazione di tutti i monoliti e un catalogo comune di ogni contratto sono sviluppi manutentivi più ampi. La revisione interviene sui componenti coinvolti nei difetti confermati.
- **25–26:** l’emulatore verifica i flussi riportati nei test, non sostituisce prove complete su telefoni, TalkBack, videocamera, registrazione audio, tastiera e personalizzazioni di contrasto. I test simulati non dimostrano tutti gli errori possibili del backend reale.
- **27:** recupero password, cancellazione account e segnalazioni restano nuove funzionalità fuori da questa correzione, come già concordato. Prima di distribuire l’app al pubblico vanno progettate e verificate.

## Verifiche riproducibili

Con JDK 21 e Android SDK 37:

```sh
./gradlew --no-daemon testDebugUnitTest lintDebug assembleRelease assembleDemo
./gradlew --no-daemon -PfyreUiDemo=true connectedDemoAndroidTest
```

Il primo comando comprende i test del repository demo. Il secondo richiede un emulatore e seleziona la demo senza credenziali. I tre test UI passati su emulatore Android 15 coprono cronologia, invio, ripristino, iscrizione/annullamento e apertura delle notifiche con verifica dell’account. Passano 145 test unitari nel branch `main` e 151 nella variante demo. Lint non segnala errori e le build release e demo sono riuscite. Anche i 136 test backend, i quattro contratti condivisi e i dodici test degli strumenti di migrazione passano. La [CI pubblicata su GitHub](https://github.com/itsminni/fyre/actions/runs/41218355830) verifica web, backend, strumenti Python, build e test Android, oltre a build e test iOS dei client connesso e demo. I tre test UI Android qui documentati sono stati eseguiti localmente su emulatore.

Vedere il [README Android](README.md#demo-offline) per il percorso dimostrativo da un minuto e l’APK.

## Appwrite

Il backend è consolidato in due Functions e un bucket, con client aggiornati. Il cambio del piano a Free è **rinviato su richiesta dell’utente** per conservare i sette archivi di backup: il piano non va descritto come Free. La pianificazione automatica dei backup è disattivata; gli archivi esistenti restano conservati. La demo Android è indipendente dalla disponibilità del backend.

## English

The Android fixes cover empty photo removal, chunked/resumable/cancellable uploads, attachment reconciliation, paginated history, lighter inbox reads, shared foreground realtime, stable retries, notification destinations, session verification retry, avatar cropping, localized UI messages and account-scoped personal preferences. Production event metrics remain absent unless supplied by the server.

The separate Android demo uses fictional process-local data, blank Appwrite configuration and no Internet permission. See the [offline demo instructions](README.md#offline-demo). It supports discovery/matches, chat, local attachments, profile editing and event registration/cancellation. Remote push delivery, real-device accessibility and the previously excluded account/reporting features are not claimed complete. Emulator checks cover only the flows implemented in `OfflineDemoUiTest`.

Appwrite technical consolidation is complete; the billing downgrade is deferred by the user's choice to retain seven historical backups. Scheduled backups remain disabled. The [published GitHub CI](https://github.com/itsminni/fyre/actions/runs/41218355830) also passed web, backend, Python, Android and iOS checks, including the dedicated iOS demo backend and UI tests. Android emulator UI checks were run locally.

Per le demo aggiunte successivamente a web e iOS e i limiti di verifica iOS, vedere [DEMO.md](../../DEMO.md).
