//
//  AppRouter.swift
//  Fyre
//
//  Created by Gabriele Mininni on 11/02/26.
//

import Combine

enum SessionBootstrapFailure: Equatable {
    case configuration
    case unavailable
}

@MainActor
final class AppRouter: ObservableObject {
    enum Root: Equatable {
        case loading
        case auth
        case main
        case bootstrapFailed(SessionBootstrapFailure)
    }

    @Published private(set) var root: Root = .loading

    func beginBootstrap() {
        root = .loading
    }

    func completeBootstrap(isLoggedIn: Bool, failure: SessionBootstrapFailure? = nil) {
        if let failure {
            root = .bootstrapFailed(failure)
        } else {
            root = isLoggedIn ? .main : .auth
        }
    }

    func sync(isLoggedIn: Bool) {
        guard root == .auth || root == .main else { return }
        root = isLoggedIn ? .main : .auth
    }
}
