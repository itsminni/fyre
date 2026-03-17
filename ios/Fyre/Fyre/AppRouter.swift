//
//  AppRouter.swift
//  Fyre
//
//  Created by Gabriele Mininni on 11/02/26.
//

import Observation

// Centralized app router
// - Holds the root navigation state for the app (authentication vs main flow)
// - Marked `@Observable` so SwiftUI views can react to changes to `root`
@Observable
final class AppRouter {
    enum Root: Equatable {
        case auth
        case main
    }

    // Current root shown by the app. Defaults to the auth flow.
    var root: Root = .auth

    // Update the root based on authentication state. Keep this logic
    // small so it can be unit-tested and observed by views.
    func sync(isLoggedIn: Bool) {
        root = isLoggedIn ? .main : .auth
    }
}
