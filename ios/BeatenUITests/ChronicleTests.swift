import XCTest

// Console Chronicles against the dev server, with an account that already
// has a chronicle (BEATEN_TEST_EMAIL / _PASSWORD, as WalkthroughTests).
// Adds a Game Boy Advance and removes it again, so it can repeat.
final class ChronicleTests: XCTestCase {
    private let env = ProcessInfo.processInfo.environment
    private var app: XCUIApplication!

    override func setUp() {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launch()
    }

    private func shot(_ name: String) {
        sleep(2)
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
        XCTAssertTrue(app.tabBars.buttons["Profile"].waitForExistence(timeout: 15))
    }

    func testChronicle() throws {
        try signIn()
        app.tabBars.buttons["Profile"].tap()
        app.buttons["Console Chronicles"].firstMatch.tap()
        XCTAssertTrue(app.staticTexts["CONSOLE CHRONICLES"].waitForExistence(timeout: 15))
        shot("c1-map")
        app.swipeUp()
        shot("c2-map-scrolled")

        app.buttons["Style"].tap()
        XCTAssertTrue(app.navigationBars["Style"].waitForExistence(timeout: 5))
        shot("c3-style")
        app.buttons["Cancel"].tap()

        // Add a console.
        app.buttons["Add console"].tap()
        XCTAssertTrue(app.navigationBars["Add console"].waitForExistence(timeout: 5))
        app.buttons["Choose a console"].tap()
        let search = app.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        shot("c4-picker")
        search.tap()
        search.typeText("advance")
        let gba = app.buttons["Game Boy Advance"].firstMatch
        XCTAssertTrue(gba.waitForExistence(timeout: 5))
        gba.tap()
        XCTAssertTrue(app.staticTexts["Game Boy Advance"].waitForExistence(timeout: 5))
        shot("c5-console-sheet")
        app.buttons["Save"].tap()
        XCTAssertTrue(app.navigationBars["Add console"].waitForNonExistence(timeout: 10))

        // It's on the map; open it and remove it.
        let card = app.staticTexts["Game Boy Advance"].firstMatch
        XCTAssertTrue(card.waitForExistence(timeout: 10))
        card.tap()
        XCTAssertTrue(app.navigationBars["Edit console"].waitForExistence(timeout: 5))
        app.swipeUp()
        app.buttons["Remove console"].tap()
        app.buttons["Remove"].firstMatch.tap()
        XCTAssertTrue(app.staticTexts["Game Boy Advance"].waitForNonExistence(timeout: 10))
    }

    func testShareCards() throws {
        try signIn()
        app.tabBars.buttons["Profile"].tap()
        app.buttons["Share cards"].firstMatch.tap()
        XCTAssertTrue(app.navigationBars["Share cards"].waitForExistence(timeout: 10))
        sleep(4) // the server renders the first card
        shot("s1-square")
        app.buttons["Story"].tap()
        sleep(5)
        shot("s2-story")
        app.buttons["Get card to share"].tap()
        XCTAssertTrue(app.buttons["Share card"].waitForExistence(timeout: 20))
    }

    func testStoryVideo() throws {
        try signIn()
        app.tabBars.buttons["Profile"].tap()
        app.buttons["Console Chronicles"].firstMatch.tap()
        let make = app.buttons["Make a story video"]
        XCTAssertTrue(make.waitForExistence(timeout: 15))
        make.tap()
        XCTAssertTrue(app.navigationBars["Story video"].waitForExistence(timeout: 5))
        sleep(6) // artwork, then a frame of each style
        shot("v1-styles")
        app.buttons["Retro CRT"].tap()
        let start = Date()
        app.buttons["Make video"].tap()
        XCTAssertTrue(app.buttons["Share video"].waitForExistence(timeout: 180))
        print("VIDEO_RENDER_SECONDS \(Int(Date().timeIntervalSince(start)))")
        sleep(3)
        shot("v2-made")
    }
}
