//
//  AppRouterTests.swift
//  Fyre
//
//  Created by Gabriele Mininni on 17/03/26.
//

import XCTest
@testable import Fyre

final class AppRouterTests: XCTestCase {
    func testRouterMovesToMainWhenLoggedIn() async {
        await MainActor.run {
            let router = AppRouter()
            router.sync(isLoggedIn: true)
            XCTAssertEqual(router.root, .main)
        }
    }

    func testRouterMovesToAuthWhenLoggedOut() async {
        await MainActor.run {
            let router = AppRouter()
            router.sync(isLoggedIn: false)
            XCTAssertEqual(router.root, .auth)
        }
    }
}
