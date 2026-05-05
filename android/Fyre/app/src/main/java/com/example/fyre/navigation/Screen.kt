package com.example.fyre.navigation

sealed class Screen(val route: String) {

    
    data object Welcome : Screen("welcome")

    
    data object Login : Screen("login")

    
    data object Register : Screen("register")

    
    data object Home : Screen("home")

    
    data object Profile : Screen("profile")

    
    data object Discover : Screen("discover")

    
    data object Messages : Screen("messages")

    
    data object Events : Screen("events")

    
    data object Account : Screen("account")
}


