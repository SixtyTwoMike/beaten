import XCTest

// The collection against the dev server (IGDB_MOCK=1), with the test account
// from WalkthroughTests (BEATEN_TEST_EMAIL / _PASSWORD). Turns it on in
// Profile, adds a copy from Library, edits it, removes it and turns it off
// again, so it can repeat.
final class CollectionTests: XCTestCase {
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

    private func collectionSwitch() -> XCUIElement {
        app.tabBars.buttons["Profile"].tap()
        let toggle = app.switches["Collection"]
        for _ in 0..<6 where !toggle.isHittable { app.swipeUp() }
        XCTAssertTrue(toggle.waitForExistence(timeout: 5))
        return toggle
    }

    private func isOn(_ toggle: XCUIElement) -> Bool { (toggle.value as? String) == "1" }

    func testCollection() throws {
        try signIn()
        XCTAssertTrue(app.buttons["Log a game"].waitForExistence(timeout: 15))
        sleep(2)

        // Off by default: no Collection segment in Library.
        var toggle = collectionSwitch()
        if isOn(toggle) { toggle.switches.firstMatch.tap(); sleep(2) }
        app.tabBars.buttons["Library"].tap()
        XCTAssertTrue(app.buttons["Pull List"].firstMatch.waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["Collection"].exists)

        toggle = collectionSwitch()
        toggle.switches.firstMatch.tap()
        XCTAssertTrue(app.switches["Show it on my profile"].waitForExistence(timeout: 10))
        shot("c1-settings")

        app.tabBars.buttons["Library"].tap()
        let segment = app.buttons["Collection"].firstMatch
        XCTAssertTrue(segment.waitForExistence(timeout: 5))
        segment.tap()
        app.navigationBars.buttons["Add a game you own"].tap()
        let field = app.textFields["collection-search"]
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        field.tap()
        field.typeText("metroid")
        let add = app.buttons["Add Super Metroid to your collection"]
        XCTAssertTrue(add.waitForExistence(timeout: 10))
        add.tap()

        // Super Metroid is SNES only, so the platform is already chosen.
        XCTAssertTrue(app.navigationBars["Add to collection"].waitForExistence(timeout: 5))
        // The picker's label carries its value ("What you have, Not said").
        app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'What you have'")).firstMatch.tap()
        app.buttons["Boxed (CIB)"].firstMatch.tap()
        let price = app.textFields["Price paid"]
        price.tap()
        price.typeText("40")
        shot("c2-add")
        app.navigationBars.buttons["Save"].tap()

        let row = app.buttons["Super Metroid, Super Nintendo Entertainment System"]
        XCTAssertTrue(row.waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Boxed (CIB) · £40.00"].exists)
        shot("c3-collection")

        // Remove it, then turn the collection off again.
        row.tap()
        app.buttons["Remove from collection"].tap()
        XCTAssertTrue(row.waitForNonExistence(timeout: 10))
        toggle = collectionSwitch()
        toggle.switches.firstMatch.tap()
        XCTAssertTrue(app.switches["Show it on my profile"].waitForNonExistence(timeout: 10))
    }
}
