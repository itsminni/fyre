package com.example.fyre.ui.navigation

/** Route del root graph: una sola fonte di verita per i flussi principali. */
object RootRoute {
    const val Auth = "root_auth"
    const val ProfileCompletion = "root_profile_completion"
    const val AuthenticatedShell = "root_authenticated_shell"
}

/** Route interne al flusso di autenticazione. */
object AuthRoute {
    const val Welcome = "auth_welcome"
    const val Login = "auth_login"
    const val Register = "auth_register"
}

/** Route interne alla shell autenticata con bottom navigation. */
object MainRoute {
    const val Home = "main_home"
    const val Discover = "main_discover"
    const val Messages = "main_messages"
    const val Events = "main_events"
    const val Account = "main_account"
}

