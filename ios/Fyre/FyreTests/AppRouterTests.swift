//
//  AppRouterTests.swift
//  Fyre
//
//  Created by Gabriele Mininni on 17/03/26.
//

import XCTest
@testable import Fyre

final class AppRouterTests: XCTestCase {
    func testRouterStartsInLoadingAndIgnoresSessionChangesBeforeBootstrap() async {
        await MainActor.run {
            let router = AppRouter()

            XCTAssertEqual(router.root, .loading)
            router.sync(isLoggedIn: true)
            XCTAssertEqual(router.root, .loading)
        }
    }

    func testRouterCompletesBootstrapIntoMainAndTracksLogout() async {
        await MainActor.run {
            let router = AppRouter()

            router.completeBootstrap(isLoggedIn: true)
            XCTAssertEqual(router.root, .main)
            router.sync(isLoggedIn: false)
            XCTAssertEqual(router.root, .auth)
        }
    }

    func testRouterCompletesBootstrapIntoAuth() async {
        await MainActor.run {
            let router = AppRouter()

            router.completeBootstrap(isLoggedIn: false)
            XCTAssertEqual(router.root, .auth)
        }
    }
}
