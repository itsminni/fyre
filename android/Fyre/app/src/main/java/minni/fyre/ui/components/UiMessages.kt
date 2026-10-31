package minni.fyre.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import minni.fyre.R

/** Localizes known validation/status messages and prevents raw server errors reaching the UI. */
@Composable
fun localizedUiMessage(message: String): String {
    val resource = when (message) {
        "Errore sconosciuto" -> R.string.ui_unknown_error
        "Inserisci il tuo nome" -> R.string.ui_display_name_required
        "Il nome deve avere almeno 2 caratteri" -> R.string.ui_display_name_min_length
        "Inserisci l'email" -> R.string.ui_email_required
        "Formato email non valido" -> R.string.ui_email_invalid
        "Inserisci la password" -> R.string.ui_login_password_required
        "La password deve avere almeno 8 caratteri" -> R.string.ui_register_password_min_length
        "La password deve contenere almeno una lettera maiuscola" -> R.string.ui_register_password_uppercase
        "La password deve contenere almeno un numero" -> R.string.ui_register_password_digit
        "Le password non corrispondono" -> R.string.ui_password_mismatch
        "Conferma di aver letto la nota sulla demo e sui dati per continuare" -> R.string.ui_demo_notice_required
        "Inserisci il nome" -> R.string.ui_profile_first_name_required
        "Inserisci la citta" -> R.string.ui_profile_city_required
        "Inserisci la data di nascita" -> R.string.ui_profile_birth_date_required
        "Devi avere almeno 18 anni" -> R.string.ui_profile_invalid_age
        "Inserisci una bio" -> R.string.ui_profile_bio_required
        "Seleziona almeno una preferenza di genere" -> R.string.ui_profile_preferred_genders_required
        "Sessione utente non disponibile" -> R.string.ui_profile_session_unavailable
        "Errore salvataggio profilo" -> R.string.ui_profile_save_error
        "Modifiche salvate automaticamente" -> R.string.ui_status_0
        "Profilo aggiornato su database" -> R.string.ui_status_1
        "Preferenze salvate sul dispositivo" -> R.string.ui_status_2
        "Notifiche aggiornate sul dispositivo" -> R.string.ui_status_3
        "Personalizzazione chat salvata sul dispositivo" -> R.string.ui_status_4
        "Aspetto aggiornato sul dispositivo" -> R.string.ui_status_5
        "Invio non riuscito. Riprova." -> R.string.ui_status_6
        "Impossibile caricare i messaggi precedenti" -> R.string.ui_status_7
        "Impossibile aggiornare i profili. Tocca per riprovare." -> R.string.ui_status_8
        else -> R.string.ui_unknown_error
    }
    return stringResource(resource)
}
