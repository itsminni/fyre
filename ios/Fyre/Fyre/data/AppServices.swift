//
//  AppServices.swift
//  Fyre
//
//  Created by Gabriele Mininni on 11/02/26.
//

import Foundation
import Observation

// Central registry for app-wide services
// - Exposes a `backend` implementation that can be swapped for testing
// - Marked `@Observable` so views or test harnesses can react if services change
@Observable
final class AppServices {
    static let shared = AppServices()

    // Backend API used by the UI (mock by default)
    var backend: BackendAPI

    init(backend: BackendAPI? = nil) {
        if let backend {
            self.backend = backend
            return
        }

        if Self.isRunningTests {
            self.backend = MockBackendAPI()
            return
        }

        do {
            // Prefer the real backend outside tests, but keep a safe mock fallback when config is missing.
            let configuration = try AppwriteConfiguration.load()
            self.backend = AppwriteBackendAPI(configuration: configuration)
        } catch {
            self.backend = MockBackendAPI()
        }
    }

    private static var isRunningTests: Bool {
        ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil
    }
}
