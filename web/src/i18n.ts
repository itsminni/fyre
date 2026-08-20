import { useCallback, useMemo } from 'react';
import { useAppStore } from './hooks/useAppStore';
import { AppLanguage } from './types/models';

export type TranslationKey =
  | 'nav.discovery'
  | 'nav.messages'
  | 'nav.events'
  | 'nav.profile'
  | 'language.italian'
  | 'language.english'
  | 'landing.tagline'
  | 'auth.login'
  | 'auth.signup'
  | 'auth.login.subtitle'
  | 'auth.signup.subtitle'
  | 'auth.email'
  | 'auth.password'
  | 'auth.password.placeholder'
  | 'auth.login.submit'
  | 'auth.login.loading'
  | 'auth.signup.submit'
  | 'auth.signup.loading'
  | 'auth.noAccount'
  | 'auth.hasAccount'
  | 'auth.demoNoticePrefix'
  | 'auth.demoNoticeLink'
  | 'demoNotice.title'
  | 'demoNotice.subtitle'
  | 'demoNotice.body1'
  | 'demoNotice.body2'
  | 'demoNotice.back'
  | 'home.title'
  | 'home.skip'
  | 'home.like'
  | 'home.wait'
  | 'home.empty.title'
  | 'home.empty.action'
  | 'home.match.title'
  | 'home.match.body'
  | 'home.match.openChat'
  | 'home.match.continue'
  | 'profile.compatibility'
  | 'profileSetup.title.complete'
  | 'profileSetup.title.edit'
  | 'profileSetup.subtitle'
  | 'profileSetup.avatar.title'
  | 'profileSetup.avatar.alt'
  | 'profileSetup.avatar.choose'
  | 'profileSetup.avatar.change'
  | 'profileSetup.avatar.remove'
  | 'profileSetup.photos.title'
  | 'profileSetup.photos.subtitle'
  | 'profileSetup.photos.add'
  | 'profileSetup.photos.max'
  | 'profileSetup.photos.empty'
  | 'profileSetup.photos.first'
  | 'profileSetup.photos.alt'
  | 'profileSetup.photos.remove'
  | 'profileSetup.required.title'
  | 'profileSetup.city.placeholder'
  | 'geocoding.attribution'
  | 'profileSetup.discovery.title'
  | 'profileSetup.discovery.subtitle'
  | 'profileSetup.preferredGenders.title'
  | 'profileSetup.genderPreference.required'
  | 'profileSetup.maxDistance.placeholder'
  | 'profileSetup.excludeSmokers'
  | 'profileSetup.excludeDrinkers'
  | 'profileSetup.social.title'
  | 'profileSetup.instagram.placeholder'
  | 'profileSetup.spotify.placeholder'
  | 'profileSetup.preferences.title'
  | 'profileSetup.preferences.subtitle'
  | 'profileSetup.save.loading'
  | 'profileSetup.save.complete'
  | 'profileSetup.save.edit'
  | 'profileSetup.confirm.eventLoss'
  | 'profileSetup.error.uploadPhoto'
  | 'profileSetup.error.cropPhoto'
  | 'profileSetup.error.maxPhotos'
  | 'profileSetup.error.readPhotos'
  | 'profileSetup.error.cityLookupFailed'
  | 'profileSetup.crop.avatar.title'
  | 'profileSetup.crop.avatar.body'
  | 'profileSetup.crop.avatar.alt'
  | 'profileSetup.crop.avatar.use'
  | 'profileSetup.crop.photo.title'
  | 'profileSetup.crop.photo.body'
  | 'profileSetup.crop.photo.alt'
  | 'profileSetup.crop.photo.use'
  | 'profileSetup.crop.zoom'
  | 'profileSetup.crop.cancel'
  | 'profileSetup.crop.reset'
  | 'intent.relationship'
  | 'intent.friendship'
  | 'intent.casual'
  | 'intent.notSure'
  | 'messages.title'
  | 'messages.empty.title'
  | 'messages.empty.body'
  | 'messages.noMessages'
  | 'messages.photo'
  | 'messages.video'
  | 'messages.audio'
  | 'messages.read'
  | 'messages.sending'
  | 'messages.sent'
  | 'messages.typing'
  | 'account.title'
  | 'account.info.title'
  | 'account.info.subtitle'
  | 'account.discovery.title'
  | 'account.discovery.subtitle'
  | 'account.appearance.title'
  | 'account.appearance.subtitle'
  | 'account.chatAppearance.title'
  | 'account.theme'
  | 'account.theme.system'
  | 'account.theme.light'
  | 'account.theme.dark'
  | 'account.showAge'
  | 'account.showDistance'
  | 'account.showIntent'
  | 'account.showInterests'
  | 'account.showInstagram'
  | 'account.showSpotify'
  | 'account.restoreDefault'
  | 'account.send'
  | 'account.color1'
  | 'account.color2'
  | 'account.color3'
  | 'account.changePhoto'
  | 'account.firstName'
  | 'account.lastName'
  | 'account.city'
  | 'account.email'
  | 'account.birthDate'
  | 'account.gender'
  | 'account.ageYears'
  | 'account.ageMissing'
  | 'account.orientation'
  | 'account.smokes'
  | 'account.drinks'
  | 'account.interests'
  | 'account.instagramTag'
  | 'account.spotifyTag'
  | 'account.saveProfile'
  | 'account.autosave.saved'
  | 'account.profileVisibility.title'
  | 'account.profileVisibility.subtitle'
  | 'account.bio'
  | 'account.intent'
  | 'account.minAge'
  | 'account.maxAge'
  | 'account.maxDistance'
  | 'account.preferredGenders'
  | 'account.excludeSmokers'
  | 'account.excludeDrinkers'
  | 'account.savePreferences'
  | 'account.notifications.title'
  | 'account.notifications.subtitle'
  | 'account.connectionStatus'
  | 'account.unreadThreads'
  | 'account.unreadNotifications'
  | 'account.notifications.enabled'
  | 'account.notifications.match'
  | 'account.notifications.messages'
  | 'account.notifications.events'
  | 'account.notifications.polling'
  | 'account.notifications.browserPush'
  | 'account.notifications.requestPermission'
  | 'account.notifications.markRead'
  | 'account.security.logout'
  | 'account.events.title'
  | 'account.events.empty'
  | 'account.events.openHistory'
  | 'account.tab.account'
  | 'account.tab.preferences'
  | 'account.tab.notifications'
  | 'account.tab.appearance'
  | 'account.tab.events'
  | 'orientation.straight'
  | 'orientation.gay'
  | 'orientation.lesbian'
  | 'orientation.bisexual'
  | 'orientation.pansexual'
  | 'orientation.other'
  | 'gender.male'
  | 'gender.female'
  | 'gender.nonBinary'
  | 'gender.other'
  | 'eventStatus.confirmed'
  | 'eventStatus.waitlisted'
  | 'eventStatus.cancelled'
  | 'eventStatus.promoted'
  | 'events.title'
  | 'events.unavailable'
  | 'events.badge.confirmed'
  | 'events.badge.pending'
  | 'events.preview.openDetail'
  | 'events.preview.posterAlt'
  | 'events.preview.remainingSlots'
  | 'events.preview.registrations'
  | 'events.detail.event'
  | 'events.detail.includedBuffet'
  | 'events.detail.includedDrink'
  | 'events.detail.dressCode'
  | 'events.detail.info'
  | 'events.detail.contribution'
  | 'events.detail.contact'
  | 'events.detail.rules'
  | 'events.detail.liveStatus'
  | 'events.detail.capacity'
  | 'events.detail.men'
  | 'events.detail.women'
  | 'events.detail.limitRemaining'
  | 'events.detail.cancellationCountdown'
  | 'events.detail.registrationCountdown'
  | 'events.action.cancel'
  | 'events.action.leaveWaitlist'
  | 'events.action.join'
  | 'events.admin.title'
  | 'events.admin.subtitle'
  | 'events.admin.eventTitle'
  | 'events.admin.dateTime'
  | 'events.admin.capacityTotal'
  | 'events.admin.capacityGender'
  | 'events.admin.venue'
  | 'events.admin.address'
  | 'events.admin.time'
  | 'events.admin.contribution'
  | 'events.admin.contact'
  | 'events.admin.dressCode'
  | 'events.admin.description'
  | 'events.admin.rules'
  | 'events.admin.save'
  | 'events.admin.participantEmail'
  | 'events.admin.destination'
  | 'events.admin.participants'
  | 'events.admin.add'
  | 'events.admin.remove'
  | 'events.history.title'
  | 'common.back';

const translations: Record<AppLanguage, Record<TranslationKey, string>> = {
  it: {
    'nav.discovery': 'Discovery',
    'nav.messages': 'Messaggi',
    'nav.events': 'Eventi',
    'nav.profile': 'Profilo',
    'language.italian': 'Italiano',
    'language.english': 'English',
    'landing.tagline': 'Dalla scintilla al Fyre',
    'auth.login': 'Accedi',
    'auth.signup': 'Registrati',
    'auth.login.subtitle': 'Continua dal punto in cui eri rimasto.',
    'auth.signup.subtitle': 'Inizia il tuo profilo Fyre in pochi passaggi.',
    'auth.email': 'Email',
    'auth.password': 'Password',
    'auth.password.placeholder': 'Almeno 8 caratteri',
    'auth.login.submit': 'Accedi',
    'auth.login.loading': 'Accesso in corso...',
    'auth.signup.submit': 'Registrati',
    'auth.signup.loading': 'Registrazione in corso...',
    'auth.noAccount': 'Non hai un account?',
    'auth.hasAccount': 'Hai già un account?',
    'auth.demoNoticePrefix': 'Ho letto la',
    'auth.demoNoticeLink': 'nota sulla demo e sui dati',
    'demoNotice.title': 'Dimostrazione di un progetto scolastico',
    'demoNotice.subtitle': 'Nota demo',
    'demoNotice.body1': 'Fyre è un progetto scolastico in pre-release. Negli ambienti dimostrativi usa soltanto dati sintetici.',
    'demoNotice.body2': 'Il client comunica con Appwrite e, per la ricerca città, con Photon su dati OpenStreetMap. Prima di offrire un servizio reale, il gestore deve fornire termini e informativa privacy completi.',
    'demoNotice.back': 'Torna alla registrazione',
    'home.title': 'Discovery',
    'home.skip': 'Salta',
    'home.like': 'Fyre',
    'home.wait': 'Attendi...',
    'home.empty.title': 'Non sono disponibili profili al momento.',
    'home.empty.action': 'Ricomincia',
    'home.match.title': 'È un match con {name}',
    'home.match.body': 'La chat è stata creata. Puoi iniziare a scrivere subito.',
    'home.match.openChat': 'Apri chat',
    'home.match.continue': 'Continua swipe',
    'profile.compatibility': 'compatibilità',
    'profileSetup.title.complete': 'Completa il profilo',
    'profileSetup.title.edit': 'Modifica profilo',
    'profileSetup.subtitle': 'Compila le informazioni essenziali per iniziare.',
    'profileSetup.avatar.title': 'Avatar profilo',
    'profileSetup.avatar.alt': 'Avatar profilo',
    'profileSetup.avatar.choose': 'Scegli avatar',
    'profileSetup.avatar.change': 'Cambia avatar',
    'profileSetup.avatar.remove': 'Rimuovi avatar',
    'profileSetup.photos.title': 'Foto per lo swipe',
    'profileSetup.photos.subtitle': 'Seleziona foto verticali nell\'ordine in cui devono apparire nella schermata fullscreen.',
    'profileSetup.photos.add': 'Aggiungi ({count}/6)',
    'profileSetup.photos.max': 'Massimo 6 foto',
    'profileSetup.photos.empty': 'Aggiungi fino a 6 foto per la discovery fullscreen.',
    'profileSetup.photos.first': 'Prima',
    'profileSetup.photos.alt': 'Foto swipe {index}',
    'profileSetup.photos.remove': 'Rimuovi foto',
    'profileSetup.required.title': 'Obbligatorio',
    'profileSetup.city.placeholder': 'Es. Reggio Emilia',
    'geocoding.attribution': 'Dati © collaboratori OpenStreetMap',
    'profileSetup.discovery.title': 'Scoperta',
    'profileSetup.discovery.subtitle': 'Questi campi cambiano chi vedi e quanto i profili risultano rilevanti.',
    'profileSetup.preferredGenders.title': 'Generi preferiti *',
    'profileSetup.genderPreference.required': 'Seleziona almeno una preferenza di genere.',
    'profileSetup.maxDistance.placeholder': 'Nessun limite',
    'profileSetup.excludeSmokers': 'Nascondi chi fuma',
    'profileSetup.excludeDrinkers': 'Nascondi chi beve alcol',
    'profileSetup.social.title': 'Social',
    'profileSetup.instagram.placeholder': '@tuo_handle',
    'profileSetup.spotify.placeholder': '@tuo_tag',
    'profileSetup.preferences.title': 'Preferenze',
    'profileSetup.preferences.subtitle': 'Questi dettagli restano modificabili.',
    'profileSetup.save.loading': 'Salvataggio...',
    'profileSetup.save.complete': 'Completa profilo',
    'profileSetup.save.edit': 'Salva profilo',
    'profileSetup.confirm.eventLoss': 'Se cambi genere o orientamento verrai rimosso dagli eventi a cui sei iscritto o in waiting list. Vuoi continuare?',
    'profileSetup.error.uploadPhoto': 'Impossibile caricare la foto.',
    'profileSetup.error.cropPhoto': 'Impossibile ritagliare la foto.',
    'profileSetup.error.maxPhotos': 'Puoi caricare al massimo 6 foto per lo swipe.',
    'profileSetup.error.readPhotos': 'Impossibile leggere una o più foto.',
    'profileSetup.error.cityLookupFailed': 'Città non trovata. Inserisci una città reale, ad esempio "Roma" o "Paris, France".',
    'profileSetup.crop.avatar.title': 'Ritaglia avatar',
    'profileSetup.crop.avatar.body': 'Trascina l\'immagine e regola lo zoom.',
    'profileSetup.crop.avatar.alt': 'Anteprima ritaglio avatar',
    'profileSetup.crop.avatar.use': 'Usa avatar',
    'profileSetup.crop.photo.title': 'Ritaglia foto',
    'profileSetup.crop.photo.body': 'Trascina in orizzontale e regola lo zoom.',
    'profileSetup.crop.photo.alt': 'Anteprima ritaglio foto swipe',
    'profileSetup.crop.photo.use': 'Usa foto',
    'profileSetup.crop.zoom': 'Zoom',
    'profileSetup.crop.cancel': 'Annulla',
    'profileSetup.crop.reset': 'Ripristina',
    'intent.relationship': 'Relazione',
    'intent.friendship': 'Amicizia',
    'intent.casual': 'Qualcosa di leggero',
    'intent.notSure': 'Esplorazione',
    'messages.title': 'Messaggi',
    'messages.empty.title': 'Nessuna chat',
    'messages.empty.body': 'Inizia a matchare per vedere i messaggi.',
    'messages.noMessages': 'Nessun messaggio',
    'messages.photo': 'Foto allegata',
    'messages.video': 'Video allegato',
    'messages.audio': 'Messaggio vocale',
    'messages.read': 'Letto',
    'messages.sending': 'Invio...',
    'messages.sent': 'Inviato',
    'messages.typing': 'Sta scrivendo...',
    'account.title': 'Profilo',
    'account.info.title': 'Informazioni',
    'account.info.subtitle': 'Alcuni dati restano bloccati dopo il setup; questa demo non offre ancora un flusso per modificarli.',
    'account.discovery.title': 'Scoperta',
    'account.discovery.subtitle': 'Questi campi cambiano chi vedi e quanto i profili risultano rilevanti.',
    'account.appearance.title': 'Aspetto app',
    'account.appearance.subtitle': 'Tema generale dell\'app.',
    'account.chatAppearance.title': 'Aspetto chat',
    'account.theme': 'Tema',
    'account.theme.system': 'Sistema',
    'account.theme.light': 'Chiaro',
    'account.theme.dark': 'Scuro',
    'account.showAge': 'Mostra età',
    'account.showDistance': 'Mostra distanza',
    'account.showIntent': 'Mostra cosa cerco',
    'account.showInterests': 'Mostra interessi comuni',
    'account.showInstagram': 'Mostra Instagram tag',
    'account.showSpotify': 'Mostra Spotify tag',
    'account.restoreDefault': 'Ripristina default',
    'account.send': 'Invia',
    'account.color1': 'Colore 1',
    'account.color2': 'Colore 2',
    'account.color3': 'Colore 3',
    'account.changePhoto': 'Cambia foto',
    'account.firstName': 'Nome',
    'account.lastName': 'Cognome',
    'account.city': 'Città',
    'account.email': 'Email',
    'account.birthDate': 'Data di nascita',
    'account.gender': 'Genere',
    'account.ageYears': '{age} anni',
    'account.ageMissing': 'Età non impostata',
    'account.orientation': 'Orientamento',
    'account.smokes': 'Fumi?',
    'account.drinks': 'Bevi alcolici?',
    'account.interests': 'Interessi',
    'account.instagramTag': 'Tag Instagram',
    'account.spotifyTag': 'Tag Spotify',
    'account.saveProfile': 'Salva profilo',
    'account.autosave.saved': 'Modifiche salvate automaticamente.',
    'account.profileVisibility.title': 'Preferenze profilo',
    'account.profileVisibility.subtitle': 'Scegli quali informazioni mostrare agli altri profili.',
    'account.bio': 'Bio',
    'account.intent': 'Cerco',
    'account.minAge': 'Età minima',
    'account.maxAge': 'Età massima',
    'account.maxDistance': 'Distanza massima',
    'account.preferredGenders': 'Generi preferiti',
    'account.excludeSmokers': 'Escludi chi fuma',
    'account.excludeDrinkers': 'Escludi chi beve',
    'account.savePreferences': 'Salva preferenze',
    'account.notifications.title': 'Notifiche e aggiornamenti',
    'account.notifications.subtitle': 'Gestisci aggiornamenti, promemoria e notifiche della chat.',
    'account.connectionStatus': 'Stato connessione',
    'account.unreadThreads': 'Thread non letti',
    'account.unreadNotifications': 'Notifiche non lette',
    'account.notifications.enabled': 'Notifiche attive',
    'account.notifications.match': 'Notifiche match',
    'account.notifications.messages': 'Notifiche messaggi',
    'account.notifications.events': 'Promemoria eventi',
    'account.notifications.polling': 'Controllo periodico notifiche',
    'account.notifications.browserPush': 'Push browser',
    'account.notifications.requestPermission': 'Richiedi permesso push ({permission})',
    'account.notifications.markRead': 'Segna notifiche lette',
    'account.security.logout': 'Disconnettiti',
    'account.events.title': 'Le mie iscrizioni eventi',
    'account.events.empty': 'Nessuna attività eventi futuri.',
    'account.events.openHistory': 'Apri cronologia completa',
    'account.tab.account': 'Account',
    'account.tab.preferences': 'Preferenze',
    'account.tab.notifications': 'Notifiche',
    'account.tab.appearance': 'Aspetto',
    'account.tab.events': 'Eventi',
    'orientation.straight': 'Etero',
    'orientation.gay': 'Gay',
    'orientation.lesbian': 'Lesbica',
    'orientation.bisexual': 'Bisessuale',
    'orientation.pansexual': 'Pansessuale',
    'orientation.other': 'Altro',
    'gender.male': 'Uomo',
    'gender.female': 'Donna',
    'gender.nonBinary': 'Non binario',
    'gender.other': 'Altro',
    'eventStatus.confirmed': 'Confermato',
    'eventStatus.waitlisted': 'In waiting list',
    'eventStatus.cancelled': 'Annullato',
    'eventStatus.promoted': 'Promosso dalla waiting list',
    'events.title': 'Eventi',
    'events.unavailable': 'Nessun evento live è disponibile in questo momento.',
    'events.badge.confirmed': 'Confermato',
    'events.badge.pending': 'In attesa',
    'events.preview.openDetail': 'Apri dettaglio evento',
    'events.preview.posterAlt': 'Poster evento',
    'events.preview.remainingSlots': 'Posti rimanenti - M: {male}, F: {female}',
    'events.preview.registrations': 'Iscritti: {total}/{max} - Waiting: {waiting}',
    'events.detail.event': 'Evento',
    'events.detail.includedBuffet': 'Buffet serale incluso',
    'events.detail.includedDrink': 'Drink di benvenuto incluso',
    'events.detail.dressCode': 'Dress code: {dressCode}',
    'events.detail.info': 'Info evento',
    'events.detail.contribution': 'Contributo: {contribution}',
    'events.detail.contact': 'Contatto: {contact}',
    'events.detail.rules': 'Regole',
    'events.detail.liveStatus': 'Stato live',
    'events.detail.capacity': 'Capienza',
    'events.detail.men': 'Uomini',
    'events.detail.women': 'Donne',
    'events.detail.limitRemaining': 'Limite {limit} - rimasti {remaining}',
    'events.detail.cancellationCountdown': 'Disdetta disponibile per: {countdown}',
    'events.detail.registrationCountdown': 'Iscrizioni aperte ancora per: {countdown}',
    'events.action.cancel': 'Annulla iscrizione',
    'events.action.leaveWaitlist': 'Esci dalla waiting list',
    'events.action.join': 'Partecipa all\'evento',
    'events.admin.title': 'Amministrazione evento',
    'events.admin.subtitle': 'Aggiorna dati evento e gestisci partecipanti e waiting list.',
    'events.admin.eventTitle': 'Titolo evento',
    'events.admin.dateTime': 'Data e ora',
    'events.admin.capacityTotal': 'Capienza totale',
    'events.admin.capacityGender': 'Capienza per genere',
    'events.admin.venue': 'Venue',
    'events.admin.address': 'Indirizzo',
    'events.admin.time': 'Orario',
    'events.admin.contribution': 'Contributo',
    'events.admin.contact': 'Contatto',
    'events.admin.dressCode': 'Dress code',
    'events.admin.description': 'Descrizione',
    'events.admin.rules': 'Regole (una per riga)',
    'events.admin.save': 'Salva modifiche evento',
    'events.admin.participantEmail': 'Email partecipante',
    'events.admin.destination': 'Destinazione',
    'events.admin.participants': 'Partecipanti',
    'events.admin.add': 'Aggiungi',
    'events.admin.remove': 'Rimuovi',
    'events.history.title': 'Tutti gli eventi futuri',
    'common.back': 'Indietro'
  },
  en: {
    'nav.discovery': 'Discovery',
    'nav.messages': 'Messages',
    'nav.events': 'Events',
    'nav.profile': 'Profile',
    'language.italian': 'Italian',
    'language.english': 'English',
    'landing.tagline': 'From spark to Fyre',
    'auth.login': 'Log in',
    'auth.signup': 'Sign up',
    'auth.login.subtitle': 'Continue where you left off.',
    'auth.signup.subtitle': 'Create your Fyre profile in a few steps.',
    'auth.email': 'Email',
    'auth.password': 'Password',
    'auth.password.placeholder': 'At least 8 characters',
    'auth.login.submit': 'Log in',
    'auth.login.loading': 'Logging in...',
    'auth.signup.submit': 'Sign up',
    'auth.signup.loading': 'Creating account...',
    'auth.noAccount': 'Don\'t have an account?',
    'auth.hasAccount': 'Already have an account?',
    'auth.demoNoticePrefix': 'I have read the',
    'auth.demoNoticeLink': 'demo and data notice',
    'demoNotice.title': 'School project demonstration',
    'demoNotice.subtitle': 'Demo notice',
    'demoNotice.body1': 'Fyre is a pre-release school project. Use synthetic data only in demonstration environments.',
    'demoNotice.body2': 'The client communicates with Appwrite and, for city search, Photon using OpenStreetMap data. Before any real-world service, the operator must provide complete terms and a privacy notice.',
    'demoNotice.back': 'Back to sign up',
    'home.title': 'Discovery',
    'home.skip': 'Skip',
    'home.like': 'Fyre',
    'home.wait': 'Please wait...',
    'home.empty.title': 'No profiles are available right now.',
    'home.empty.action': 'Start over',
    'home.match.title': 'It\'s a match with {name}',
    'home.match.body': 'The chat has been created. You can start writing now.',
    'home.match.openChat': 'Open chat',
    'home.match.continue': 'Keep swiping',
    'profile.compatibility': 'compatibility',
    'profileSetup.title.complete': 'Complete your profile',
    'profileSetup.title.edit': 'Edit profile',
    'profileSetup.subtitle': 'Fill in the essential information to get started.',
    'profileSetup.avatar.title': 'Profile avatar',
    'profileSetup.avatar.alt': 'Profile avatar',
    'profileSetup.avatar.choose': 'Choose avatar',
    'profileSetup.avatar.change': 'Change avatar',
    'profileSetup.avatar.remove': 'Remove avatar',
    'profileSetup.photos.title': 'Swipe photos',
    'profileSetup.photos.subtitle': 'Select vertical photos in the order they should appear fullscreen.',
    'profileSetup.photos.add': 'Add ({count}/6)',
    'profileSetup.photos.max': 'Maximum 6 photos',
    'profileSetup.photos.empty': 'Add up to 6 photos for fullscreen discovery.',
    'profileSetup.photos.first': 'First',
    'profileSetup.photos.alt': 'Swipe photo {index}',
    'profileSetup.photos.remove': 'Remove photo',
    'profileSetup.required.title': 'Required',
    'profileSetup.city.placeholder': 'E.g. Reggio Emilia',
    'geocoding.attribution': 'Data © OpenStreetMap contributors',
    'profileSetup.discovery.title': 'Discovery',
    'profileSetup.discovery.subtitle': 'These fields shape who you see and how relevant profiles are.',
    'profileSetup.preferredGenders.title': 'Preferred genders *',
    'profileSetup.genderPreference.required': 'Select at least one gender preference.',
    'profileSetup.maxDistance.placeholder': 'No limit',
    'profileSetup.excludeSmokers': 'Hide smokers',
    'profileSetup.excludeDrinkers': 'Hide people who drink alcohol',
    'profileSetup.social.title': 'Social',
    'profileSetup.instagram.placeholder': '@your_handle',
    'profileSetup.spotify.placeholder': '@your_tag',
    'profileSetup.preferences.title': 'Preferences',
    'profileSetup.preferences.subtitle': 'These details remain editable.',
    'profileSetup.save.loading': 'Saving...',
    'profileSetup.save.complete': 'Complete profile',
    'profileSetup.save.edit': 'Save profile',
    'profileSetup.confirm.eventLoss': 'Changing gender or orientation will remove you from events you are registered for or waitlisted on. Continue?',
    'profileSetup.error.uploadPhoto': 'Unable to upload the photo.',
    'profileSetup.error.cropPhoto': 'Unable to crop the photo.',
    'profileSetup.error.maxPhotos': 'You can upload up to 6 swipe photos.',
    'profileSetup.error.readPhotos': 'Unable to read one or more photos.',
    'profileSetup.error.cityLookupFailed': 'City not found. Enter a real city, for example "Rome" or "Paris, France".',
    'profileSetup.crop.avatar.title': 'Crop avatar',
    'profileSetup.crop.avatar.body': 'Drag the image and adjust zoom.',
    'profileSetup.crop.avatar.alt': 'Avatar crop preview',
    'profileSetup.crop.avatar.use': 'Use avatar',
    'profileSetup.crop.photo.title': 'Crop photo',
    'profileSetup.crop.photo.body': 'Drag horizontally and adjust zoom.',
    'profileSetup.crop.photo.alt': 'Swipe photo crop preview',
    'profileSetup.crop.photo.use': 'Use photo',
    'profileSetup.crop.zoom': 'Zoom',
    'profileSetup.crop.cancel': 'Cancel',
    'profileSetup.crop.reset': 'Reset',
    'intent.relationship': 'Relationship',
    'intent.friendship': 'Friendship',
    'intent.casual': 'Something casual',
    'intent.notSure': 'Exploring',
    'messages.title': 'Messages',
    'messages.empty.title': 'No chats',
    'messages.empty.body': 'Start matching to see messages.',
    'messages.noMessages': 'No messages',
    'messages.photo': 'Photo attached',
    'messages.video': 'Video attached',
    'messages.audio': 'Voice message',
    'messages.read': 'Read',
    'messages.sending': 'Sending...',
    'messages.sent': 'Sent',
    'messages.typing': 'Typing...',
    'account.title': 'Profile',
    'account.info.title': 'Information',
    'account.info.subtitle': 'Some details stay locked after setup; this demo does not yet provide a flow to change them.',
    'account.discovery.title': 'Discovery',
    'account.discovery.subtitle': 'These fields shape who you see and how relevant profiles are.',
    'account.appearance.title': 'App appearance',
    'account.appearance.subtitle': 'General app theme.',
    'account.chatAppearance.title': 'Chat appearance',
    'account.theme': 'Theme',
    'account.theme.system': 'System',
    'account.theme.light': 'Light',
    'account.theme.dark': 'Dark',
    'account.showAge': 'Show age',
    'account.showDistance': 'Show distance',
    'account.showIntent': 'Show intent',
    'account.showInterests': 'Show common interests',
    'account.showInstagram': 'Show Instagram tag',
    'account.showSpotify': 'Show Spotify tag',
    'account.restoreDefault': 'Restore default',
    'account.send': 'Send',
    'account.color1': 'Color 1',
    'account.color2': 'Color 2',
    'account.color3': 'Color 3',
    'account.changePhoto': 'Change photo',
    'account.firstName': 'First name',
    'account.lastName': 'Last name',
    'account.city': 'City',
    'account.email': 'Email',
    'account.birthDate': 'Date of birth',
    'account.gender': 'Gender',
    'account.ageYears': '{age} years old',
    'account.ageMissing': 'Age not set',
    'account.orientation': 'Orientation',
    'account.smokes': 'Do you smoke?',
    'account.drinks': 'Do you drink alcohol?',
    'account.interests': 'Interests',
    'account.instagramTag': 'Instagram tag',
    'account.spotifyTag': 'Spotify tag',
    'account.saveProfile': 'Save profile',
    'account.autosave.saved': 'Changes saved automatically.',
    'account.profileVisibility.title': 'Profile preferences',
    'account.profileVisibility.subtitle': 'Choose which details are shown to other profiles.',
    'account.bio': 'Bio',
    'account.intent': 'Looking for',
    'account.minAge': 'Minimum age',
    'account.maxAge': 'Maximum age',
    'account.maxDistance': 'Maximum distance',
    'account.preferredGenders': 'Preferred genders',
    'account.excludeSmokers': 'Exclude smokers',
    'account.excludeDrinkers': 'Exclude drinkers',
    'account.savePreferences': 'Save preferences',
    'account.notifications.title': 'Notifications and updates',
    'account.notifications.subtitle': 'Manage updates, reminders, and chat notifications.',
    'account.connectionStatus': 'Connection status',
    'account.unreadThreads': 'Unread threads',
    'account.unreadNotifications': 'Unread notifications',
    'account.notifications.enabled': 'Notifications enabled',
    'account.notifications.match': 'Match notifications',
    'account.notifications.messages': 'Message notifications',
    'account.notifications.events': 'Event reminders',
    'account.notifications.polling': 'Periodic notification checks',
    'account.notifications.browserPush': 'Browser push',
    'account.notifications.requestPermission': 'Request push permission ({permission})',
    'account.notifications.markRead': 'Mark notifications read',
    'account.security.logout': 'Log out',
    'account.events.title': 'My event registrations',
    'account.events.empty': 'No upcoming event activity.',
    'account.events.openHistory': 'Open full history',
    'account.tab.account': 'Account',
    'account.tab.preferences': 'Preferences',
    'account.tab.notifications': 'Notifications',
    'account.tab.appearance': 'Appearance',
    'account.tab.events': 'Events',
    'orientation.straight': 'Straight',
    'orientation.gay': 'Gay',
    'orientation.lesbian': 'Lesbian',
    'orientation.bisexual': 'Bisexual',
    'orientation.pansexual': 'Pansexual',
    'orientation.other': 'Other',
    'gender.male': 'Man',
    'gender.female': 'Woman',
    'gender.nonBinary': 'Non-binary',
    'gender.other': 'Other',
    'eventStatus.confirmed': 'Confirmed',
    'eventStatus.waitlisted': 'Waitlisted',
    'eventStatus.cancelled': 'Cancelled',
    'eventStatus.promoted': 'Promoted from waitlist',
    'events.title': 'Events',
    'events.unavailable': 'No live event is available right now.',
    'events.badge.confirmed': 'Confirmed',
    'events.badge.pending': 'Pending',
    'events.preview.openDetail': 'Open event details',
    'events.preview.posterAlt': 'Event poster',
    'events.preview.remainingSlots': 'Remaining spots - M: {male}, F: {female}',
    'events.preview.registrations': 'Registered: {total}/{max} - Waiting: {waiting}',
    'events.detail.event': 'Event',
    'events.detail.includedBuffet': 'Evening buffet included',
    'events.detail.includedDrink': 'Welcome drink included',
    'events.detail.dressCode': 'Dress code: {dressCode}',
    'events.detail.info': 'Event info',
    'events.detail.contribution': 'Contribution: {contribution}',
    'events.detail.contact': 'Contact: {contact}',
    'events.detail.rules': 'Rules',
    'events.detail.liveStatus': 'Live status',
    'events.detail.capacity': 'Capacity',
    'events.detail.men': 'Men',
    'events.detail.women': 'Women',
    'events.detail.limitRemaining': 'Limit {limit} - {remaining} remaining',
    'events.detail.cancellationCountdown': 'Cancellation available for: {countdown}',
    'events.detail.registrationCountdown': 'Registration open for: {countdown}',
    'events.action.cancel': 'Cancel registration',
    'events.action.leaveWaitlist': 'Leave waitlist',
    'events.action.join': 'Join event',
    'events.admin.title': 'Event administration',
    'events.admin.subtitle': 'Update event details and manage participants and the waitlist.',
    'events.admin.eventTitle': 'Event title',
    'events.admin.dateTime': 'Date and time',
    'events.admin.capacityTotal': 'Total capacity',
    'events.admin.capacityGender': 'Capacity by gender',
    'events.admin.venue': 'Venue',
    'events.admin.address': 'Address',
    'events.admin.time': 'Time',
    'events.admin.contribution': 'Contribution',
    'events.admin.contact': 'Contact',
    'events.admin.dressCode': 'Dress code',
    'events.admin.description': 'Description',
    'events.admin.rules': 'Rules (one per line)',
    'events.admin.save': 'Save event changes',
    'events.admin.participantEmail': 'Participant email',
    'events.admin.destination': 'Destination',
    'events.admin.participants': 'Participants',
    'events.admin.add': 'Add',
    'events.admin.remove': 'Remove',
    'events.history.title': 'All upcoming events',
    'common.back': 'Back'
  }
};

export function useI18n() {
  const { persisted, updateSettings } = useAppStore();
  const language = persisted.settings.language;

  const setLanguage = useCallback(
    (nextLanguage: AppLanguage) => updateSettings({ language: nextLanguage }),
    [updateSettings]
  );

  const t = useCallback(
    (key: TranslationKey, values?: Record<string, string | number>) => {
      let value = translations[language][key] ?? translations.it[key] ?? key;
      if (values) {
        for (const [name, replacement] of Object.entries(values)) {
          value = value.replace(`{${name}}`, String(replacement));
        }
      }
      return value;
    },
    [language]
  );

  return useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);
}
