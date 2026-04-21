package com.example.fyre.data.repository

import android.content.Context
import com.example.fyre.data.model.PasswordUtils
import com.example.fyre.data.model.User
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import java.io.File

/**
 * Repository per la gestione degli utenti.
 *
 * Implementa il pattern Repository: astrae la sorgente dati (in questo caso un file JSON)
 * dal resto dell'app. Quando si collegherà un database, basterà modificare questa classe
 * senza toccare il ViewModel o le schermate.
 *
 * @property context Il contesto dell'applicazione, necessario per accedere ai file interni
 */
class UserRepository(private val context: Context) : AuthRepository {

    // Nome del file JSON dove vengono salvati gli utenti
    companion object {
        private const val FILE_NAME = "users.json"
    }

    // Istanza Gson per la serializzazione/deserializzazione
    private val gson = Gson()

    // Riferimento al file nella directory interna dell'app
    private val file: File
        get() = File(context.filesDir, FILE_NAME)

    // ============================================================
    // Metodi di lettura
    // ============================================================

    /**
     * Legge tutti gli utenti dal file JSON.
     * Se il file non esiste o è vuoto, restituisce una lista vuota.
     *
     * @return Lista di tutti gli utenti registrati
     */
    fun getUsers(): List<User> {
        // Controlla se il file esiste e non è vuoto
        if (!file.exists() || file.readText().isBlank()) {
            return emptyList()
        }

        return try {
            val json = file.readText()
            // TypeToken necessario per deserializzare generici con Gson
            val type = object : TypeToken<List<User>>() {}.type
            gson.fromJson(json, type) ?: emptyList()
        } catch (e: Exception) {
            // In caso di errore di parsing, restituisce lista vuota
            emptyList()
        }
    }

    /**
     * Cerca un utente per email.
     *
     * @param email L'email da cercare (case-insensitive)
     * @return L'utente trovato, oppure null se non esiste
     */
    override fun findUserByEmail(email: String): User? {
        return getUsers().find { it.email.equals(email, ignoreCase = true) }
    }

    // ============================================================
    // Metodi di scrittura
    // ============================================================

    /**
     * Aggiunge un nuovo utente al file JSON.
     * La password viene hashata prima del salvataggio.
     *
     * @param email Email dell'utente
     * @param password Password in chiaro (verrà hashata)
     * @param displayName Nome visualizzato
     * @return Result.success con l'utente creato, oppure Result.failure con l'errore
     */
    override fun registerUser(
        email: String,
        password: String,
        displayName: String,
        termsAcceptedAt: Long?,
        privacyAcceptedAt: Long?
    ): Result<User> {
        // Controlla se l'email è già registrata
        if (findUserByEmail(email) != null) {
            return Result.failure(Exception("Esiste già un account con questa email"))
        }

        // Crea il nuovo utente con la password hashata
        val newUser = User(
            email = email.lowercase().trim(),
            passwordHash = PasswordUtils.hashPassword(password),
            displayName = displayName.trim(),
            createdAt = System.currentTimeMillis(),
            termsAcceptedAt = termsAcceptedAt,
            privacyAcceptedAt = privacyAcceptedAt
        )

        // Aggiunge l'utente alla lista esistente e salva
        val users = getUsers().toMutableList()
        users.add(newUser)
        saveUsers(users)

        return Result.success(newUser)
    }

    fun registerUser(email: String, password: String, displayName: String): Result<User> {
        return registerUser(
            email = email,
            password = password,
            displayName = displayName,
            termsAcceptedAt = null,
            privacyAcceptedAt = null
        )
    }

    /**
     * Autentica un utente con email e password.
     *
     * @param email Email dell'utente
     * @param password Password in chiaro
     * @return Result.success con l'utente autenticato, oppure Result.failure con l'errore
     */
    override fun authenticateUser(email: String, password: String): Result<User> {
        val user = findUserByEmail(email)
            ?: return Result.failure(Exception("Nessun account trovato con questa email"))

        // Verifica la password confrontando gli hash
        return if (PasswordUtils.verifyPassword(password, user.passwordHash)) {
            Result.success(user)
        } else {
            Result.failure(Exception("Password non corretta"))
        }
    }

    // ============================================================
    // Metodi privati di utilità
    // ============================================================

    /**
     * Salva la lista completa degli utenti sul file JSON.
     * Sovrascrive il contenuto precedente.
     *
     * @param users Lista degli utenti da salvare
     */
    private fun saveUsers(users: List<User>) {
        val json = gson.toJson(users)
        file.writeText(json)
    }
}

