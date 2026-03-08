package com.example.fyre.ui.navigation

/**
 * Sealed class che definisce tutte le schermate (route) dell'app.
 *
 * Ogni oggetto rappresenta una destinazione navigabile.
 * La proprietà [route] è una stringa univoca usata dal NavController.
 *
 * @property route Identificatore univoco della schermata
 */
sealed class Screen(val route: String) {

    /** Schermata di benvenuto — punto di ingresso dell'app */
    data object Welcome : Screen("welcome")

    /** Schermata di login */
    data object Login : Screen("login")

    /** Schermata di registrazione nuovo account */
    data object Register : Screen("register")

    /** Schermata principale dopo il login */
    data object Home : Screen("home")
}

