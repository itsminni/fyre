package minni.fyre.ui.navigation

import android.net.Uri


object RootRoute {
    const val Auth = "root_auth"
    const val ProfileCompletion = "root_profile_completion"
    const val AuthenticatedShell = "root_authenticated_shell"
}


object AuthRoute {
    const val Welcome = "auth_welcome"
    const val Login = "auth_login"
    const val Register = "auth_register"
    const val DemoNotice = "auth_demo_notice"
}


object MainRoute {
    const val Home = "main_home"
    const val Discover = "main_discover"
    const val Messages = "main_messages"
    const val ThreadIdArg = "threadId"
    const val MessagesThread = "main_messages/{threadId}"
    const val Events = "main_events"
    const val Account = "main_account"

    fun messagesThread(threadId: String): String = "main_messages/${Uri.encode(threadId)}"
}
