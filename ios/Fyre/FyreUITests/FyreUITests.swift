//
//  FyreUITests.swift
//  Fyre
//
//  Created by Gabriele Mininni on 17/03/26.
//

import XCTest

final class FyreUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testOpenSignupAndBackToLogin() throws {
        let app = XCUIApplication()
        app.launchArguments.append("-uitest-reset")
        app.launch()

        let signupButton = app.buttons["landing.signup"]
        XCTAssertTrue(signupButton.waitForExistence(timeout: 3))
        signupButton.tap()

        XCTAssertTrue(app.buttons["signup.submit"].waitForExistence(timeout: 3))
        app.buttons["signup.gotoLogin"].tap()
        XCTAssertTrue(app.buttons["login.submit"].waitForExistence(timeout: 3))
    }
}
