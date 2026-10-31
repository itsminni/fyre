import XCTest

final class OfflineDemoUITests: XCTestCase {
    func testDemoStartsWithoutConfigurationSendsAndResets() throws {
#if FYRE_DEMO
        let app = XCUIApplication()
        app.launchArguments = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        XCTAssertTrue(app.buttons["demo.reset"].waitForExistence(timeout: 8))
        app.tabBars.buttons["Messages"].tap()
        app.staticTexts["Taylor"].firstMatch.tap()
        let composer = app.textFields["chat.composer"].exists ? app.textFields["chat.composer"] : app.textViews["chat.composer"]
        XCTAssertTrue(composer.waitForExistence(timeout: 5))
        composer.tap(); composer.typeText("Hello offline demo")
        app.buttons["chat.send"].tap()
        XCTAssertTrue(app.staticTexts["Hello offline demo"].waitForExistence(timeout: 5))
        app.buttons["demo.reset"].tap()
        XCTAssertTrue(app.tabBars.buttons["Messages"].waitForExistence(timeout: 5))
#else
        throw XCTSkip("Run the FyreDemo scheme to exercise the offline app")
#endif
    }
}
