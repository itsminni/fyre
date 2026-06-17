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
        case auth
        case main
    }

    @Published var root: Root = .auth

    func sync(isLoggedIn: Bool) {
        root = isLoggedIn ? .main : .auth
    }
}
