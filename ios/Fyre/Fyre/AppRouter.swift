//
//  AppRouter.swift
//  Fyre
//
//  Created by Gabriele Mininni on 11/02/26.
//

import Combine

@MainActor
final class AppRouter: ObservableObject {
    enum Root: Equatable {
        case loading
        case auth
        case main
    }

    @Published private(set) var root: Root = .loading

    func completeBootstrap(isLoggedIn: Bool) {
        root = isLoggedIn ? .main : .auth
    }

    func sync(isLoggedIn: Bool) {
        guard root != .loading else { return }
        root = isLoggedIn ? .main : .auth
    }
}
