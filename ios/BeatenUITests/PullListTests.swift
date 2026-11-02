import XCTest

// The Pull List against the dev server (IGDB_MOCK=1), with the test account
// from WalkthroughTests (BEATEN_TEST_EMAIL / _PASSWORD). Adds two games,
// sorts by release date, then removes both, so it can repeat.
final class PullListTests: XCTestCase {
    private let env = ProcessInfo.processInfo.environment
    private var app: XCUIApplication!

    override func setUp() {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launch()
    }

    private func shot(_ name: String) {
        sleep(1)
        let png = XCUIScreen.main.screenshot().pngRepresentation
        let attachment = XCTAttachment(data: png, uniformTypeIdentifier: "public.png")
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
        if let dir = env["BEATEN_SHOTS_DIR"] {
            try? png.write(to: URL(fileURLWithPath: dir).appendingPathComponent("\(name).png"))
        }
    }

    private func signIn() throws {
        let email = try XCTUnwrap(env["BEATEN_TEST_EMAIL"], "set BEATEN_TEST_EMAIL")
        let password = try XCTUnwrap(env["BEATEN_TEST_PASSWORD"], "set BEATEN_TEST_PASSWORD")
        // Still signed in from an earlier run (as the test account).
        if app.tabBars.buttons["Profile"].waitForExistence(timeout: 5) { return }
        let emailField = app.textFields["Email"]
        XCTAssertTrue(emailField.waitForExistence(timeout: 10))
        emailField.tap()
        emailField.typeText(email)
        app.secureTextFields["Password"].tap()
        app.secureTextFields["Password"].typeText(password)
        app.buttons["Sign in"].tap()
        XCTAssertTrue(app.tabBars.buttons["Profile"].waitForExistence(timeout: 15))
    }

    private func add(_ query: String, _ name: String) {
        app.buttons["Add a game"].firstMatch.tap()
        let field = app.textFields["pull-search"]
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        field.tap()
        field.typeText(query)
        let add = app.buttons["Add \(name) to your Pull List"]
        XCTAssertTrue(add.waitForExistence(timeout: 10))
        add.tap()
        XCTAssertTrue(app.buttons["\(name) is on your Pull List"].waitForExistence(timeout: 10))
        app.buttons["Done"].tap()
    }

    private func remove(_ name: String) {
        let row = app.cells.containing(.staticText, identifier: name).firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 5))
        row.swipeLeft()
        app.buttons["Remove"].firstMatch.tap()
        XCTAssertTrue(row.waitForNonExistence(timeout: 10))
    }

    func testPullList() throws {
        try signIn()
        // The first tap can land while Home is still loading.
        XCTAssertTrue(app.buttons["Log a game"].waitForExistence(timeout: 15))
        let pull = app.buttons["Pull List"].firstMatch
        for _ in 0..<3 where !pull.exists {
            app.tabBars.buttons["Library"].tap()
            _ = pull.waitForExistence(timeout: 3)
        }
        pull.tap()
        XCTAssertTrue(app.navigationBars.buttons["Add a game"].waitForExistence(timeout: 10))
        // Left over from a run that stopped part way.
        sleep(2)
        for name in ["Grand Theft Auto VI", "Untitled Space Game"] where app.staticTexts[name].exists { remove(name) }

        add("Grand Theft", "Grand Theft Auto VI")
        add("Untitled Space", "Untitled Space Game")
        XCTAssertTrue(app.staticTexts["Grand Theft Auto VI"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["TBA"].exists)
        shot("p1-pull-list")

        app.buttons["pull-options"].tap()
        app.buttons["Release date"].firstMatch.tap()
        XCTAssertTrue(app.staticTexts["Coming up · 1"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["No date yet · 1"].exists)
        shot("p2-by-release")

        app.buttons["pull-options"].tap()
        app.buttons["My order"].firstMatch.tap()

        // Reorder from the menu: Done replaces Add while editing.
        app.buttons["pull-options"].tap()
        app.buttons["Reorder"].firstMatch.tap()
        XCTAssertTrue(app.buttons["Done"].waitForExistence(timeout: 5))
        shot("p3-reorder")
        app.buttons["Done"].tap()

        remove("Grand Theft Auto VI")
        remove("Untitled Space Game")
    }
}
