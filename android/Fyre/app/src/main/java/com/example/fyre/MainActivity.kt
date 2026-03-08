package com.example.fyre

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.rememberNavController
import com.example.fyre.data.repository.UserRepository
import com.example.fyre.ui.auth.AuthViewModel
import com.example.fyre.ui.auth.AuthViewModelFactory
import com.example.fyre.ui.navigation.NavGraph
import com.example.fyre.ui.theme.FyreTheme

/**
 * Activity principale dell'app Fyre.
 *
 * Punto di ingresso dell'applicazione. Inizializza:
 * - Il tema Material 3 personalizzato (FyreTheme)
 * - Il repository per la persistenza degli utenti su file JSON
 * - Il ViewModel per la gestione dell'autenticazione
 * - Il grafo di navigazione tra le schermate
 */
class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Abilita il rendering edge-to-edge (contenuto sotto status/navigation bar)
        enableEdgeToEdge()

        // Inizializza il repository con il contesto dell'applicazione
        // (applicationContext vive per tutta la durata dell'app, evita memory leak)
        val userRepository = UserRepository(applicationContext)

        setContent {
            FyreTheme {
                // Controller di navigazione — gestisce lo stack delle schermate
                val navController = rememberNavController()

                // ViewModel condiviso tra tutte le schermate di autenticazione
                // La factory permette di passare il repository al costruttore
                val authViewModel: AuthViewModel = viewModel(
                    factory = AuthViewModelFactory(userRepository)
                )

                // Grafo di navigazione — definisce le schermate e le transizioni
                NavGraph(
                    navController = navController,
                    authViewModel = authViewModel
                )
            }
        }
    }
}

