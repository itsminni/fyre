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

    func testChatHistoryPreservesReadingPositionAndReachesOldestMessage() {
        let app = XCUIApplication()
        app.launchArguments += ["-uitest-reset", "-uitest-chat-history"]
        app.launch()
        XCTAssertTrue(app.staticTexts["History message 100"].waitForExistence(timeout: 5))
        let scroll = app.scrollViews.firstMatch
        for _ in 0..<20 {
            if app.staticTexts["History message 51"].exists && app.staticTexts["History message 51"].isHittable { break }
            scroll.swipeDown()
        }
        XCTAssertTrue(app.staticTexts["History message 51"].isHittable)
        // Automatic pagination should leave the old page boundary near the viewport.
        XCTAssertTrue(app.staticTexts["History message 50"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["History message 51"].isHittable)
        for _ in 0..<20 {
            if app.staticTexts["History message 1"].exists && app.staticTexts["History message 1"].isHittable { break }
            scroll.swipeDown()
        }
        XCTAssertTrue(app.staticTexts["History message 1"].isHittable)
        XCTAssertFalse(app.buttons["chat.loadOlderMessages"].exists)
    }

    func testChatComposerRemainsReachableWithLargestTextAndKeyboard() {
        let app = XCUIApplication()
        app.launchArguments += ["-uitest-reset", "-uitest-chat-history", "-uitest-accessibility"]
        app.launch()
        let composer = app.descendants(matching: .any).matching(identifier: "chat.composer").firstMatch
        XCTAssertTrue(composer.waitForExistence(timeout: 5))
        composer.tap()
        composer.typeText("Accessible message")
        let send = app.buttons["chat.send"]
        XCTAssertTrue(send.waitForExistence(timeout: 5))
        XCTAssertTrue(send.isEnabled)
        XCTAssertTrue(send.isHittable)
        XCTAssertLessThanOrEqual(send.frame.maxX, app.frame.maxX)
        XCTAssertGreaterThanOrEqual(composer.frame.minX, app.frame.minX)
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "Chat with largest text and keyboard"
        screenshot.lifetime = .keepAlways
        add(screenshot)
    }

    func testChatHistoryCanRetryAFailedPage() {
        let app = XCUIApplication()
        app.launchArguments += ["-uitest-reset", "-uitest-chat-history", "-uitest-history-error"]
        app.launch()
        XCTAssertTrue(app.staticTexts["History message 100"].waitForExistence(timeout: 5))
        let scroll = app.scrollViews.firstMatch
        for _ in 0..<22 {
            if app.buttons["chat.loadOlderMessages"].exists && app.buttons["chat.loadOlderMessages"].isHittable { break }
            scroll.swipeDown()
        }
        XCTAssertTrue(app.staticTexts["chat.historyLoadError"].waitForExistence(timeout: 5))
        let retry = app.buttons["chat.loadOlderMessages"]
        XCTAssertTrue(retry.waitForExistence(timeout: 5))
        retry.tap()
        for _ in 0..<22 {
            if app.staticTexts["History message 1"].exists && app.staticTexts["History message 1"].isHittable { break }
            scroll.swipeDown()
        }
        XCTAssertTrue(app.staticTexts["History message 1"].isHittable)
    }

}
