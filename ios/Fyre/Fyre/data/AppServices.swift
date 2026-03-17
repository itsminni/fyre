//
//  AppServices.swift
//  Fyre
//
//  Created by Gabriele Mininni on 11/02/26.
//

import Observation

// Central registry for app-wide services
// - Exposes a `backend` implementation that can be swapped for testing
// - Marked `@Observable` so views or test harnesses can react if services change
@Observable
final class AppServices {
    static let shared = AppServices()

    // Backend API used by the UI (mock by default)
    var backend: BackendAPI

    init(backend: BackendAPI = MockBackendAPI()) {
        self.backend = backend
    }
}
