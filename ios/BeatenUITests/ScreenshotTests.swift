import XCTest

// App Store screenshots. Like WalkthroughTests it signs in with
// BEATEN_TEST_EMAIL / BEATEN_TEST_PASSWORD against the dev server, but only
// looks: nothing is saved. Run it with BEATEN_SHOTS_DIR set, on the 6.9"
// simulator, against an account with a full diary (see docs/iphone-app.md).
final class ScreenshotTests: XCTestCase {
    private let env = ProcessInfo.processInfo.environment
    private var app: XCUIApplication!

    override func setUp() {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launch()
    }

    private func shot(_ name: String) {
        sleep(2) // covers load
        let png = XCUIScreen.main.screenshot().pngRepresentation
        let attachment = XCTAttachment(data: png, uniformTypeIdentifier: "public.png")
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
        if let dir = env["BEATEN_SHOTS_DIR"] {
            try? png.write(to: URL(fileURLWithPath: dir).appendingPathComponent("\(name).png"))
        }
    }

    func testAppStoreScreens() throws {
        let email = try XCTUnwrap(env["BEATEN_TEST_EMAIL"], "set BEATEN_TEST_EMAIL")
        let password = try XCTUnwrap(env["BEATEN_TEST_PASSWORD"], "set BEATEN_TEST_PASSWORD")

        if app.tabBars.buttons["Profile"].waitForExistence(timeout: 5) {
            app.tabBars.buttons["Profile"].tap()
            app.buttons["Sign out"].firstMatch.tap()
            app.sheets.buttons["Sign out"].firstMatch.tap()
        }
        let emailField = app.textFields["Email"]
        XCTAssertTrue(emailField.waitForExistence(timeout: 10))
        emailField.tap()
        emailField.typeText(email)
        app.secureTextFields["Password"].tap()
        app.secureTextFields["Password"].typeText(password)
        app.buttons["Sign in"].tap()

        let tabs = app.tabBars
        XCTAssertTrue(app.staticTexts["Recently finished".uppercased()].waitForExistence(timeout: 15))

        // A finished game with a review.
        app.staticTexts["Clair Obscur: Expedition 33"].firstMatch.tap()
        XCTAssertTrue(app.staticTexts["YOUR ENTRIES"].waitForExistence(timeout: 10))
        shot("3-game")
        app.navigationBars.buttons.firstMatch.tap()

        tabs.buttons["Diary"].tap()
        XCTAssertTrue(app.buttons.containing(NSPredicate(format: "label BEGINSWITH 'Balatro'")).firstMatch.waitForExistence(timeout: 5))
        shot("4-diary")

        tabs.buttons["Shelves"].tap()
        app.staticTexts["All-timers"].firstMatch.tap()
        XCTAssertTrue(app.navigationBars["All-timers"].waitForExistence(timeout: 5))
        shot("6-shelf")

        // Home last, once its covers are cached.
        tabs.buttons["Home"].tap()
        shot("1-home")

        // Search, then the log sheet with a rating (cancelled; the search
        // tab hides the tab bar, so it goes last).
        tabs.buttons["Search"].tap()
        let search = app.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        search.tap()
        search.typeText("metroid")
        let logPrime = app.buttons["Log Metroid Prime 4: Beyond"].firstMatch
        XCTAssertTrue(logPrime.waitForExistence(timeout: 15))
        app.keyboards.buttons["search"].firstMatch.tapIfPresent()
        shot("5-search")
        logPrime.tap()
        app.buttons["Beaten"].firstMatch.tap()
        XCTAssertTrue(app.navigationBars["Log game"].waitForExistence(timeout: 5))
        // 4.5 stars: a tap on the fifth star's left half.
        let stars = app.descendants(matching: .any)["Rating"].firstMatch
        XCTAssertTrue(stars.waitForExistence(timeout: 5))
        stars.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0.5)).withOffset(CGVector(dx: 160, dy: 0)).tap()
        shot("2-log")
        app.buttons["Cancel"].tap()
    }
}

private extension XCUIElement {
    func tapIfPresent() { if exists { tap() } }
}
