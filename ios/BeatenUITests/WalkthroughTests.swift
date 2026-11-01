import XCTest

// Drives the app against the local dev server (Debug build) with a test
// account: BEATEN_TEST_EMAIL / BEATEN_TEST_PASSWORD in the scheme's test
// environment, or passed as TEST_RUNNER_BEATEN_TEST_EMAIL etc. to xcodebuild.
// Screenshots go to BEATEN_SHOTS_DIR when set.
final class WalkthroughTests: XCTestCase {
    private let env = ProcessInfo.processInfo.environment
    private var app: XCUIApplication!

    override func setUp() {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launch()
    }

    private func shot(_ name: String) {
        let png = XCUIScreen.main.screenshot().pngRepresentation
        let attachment = XCTAttachment(data: png, uniformTypeIdentifier: "public.png")
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
        if let dir = env["BEATEN_SHOTS_DIR"] {
            try? png.write(to: URL(fileURLWithPath: dir).appendingPathComponent("\(name).png"))
        }
    }

    func testCoreLoop() throws {
        let email = try XCTUnwrap(env["BEATEN_TEST_EMAIL"], "set BEATEN_TEST_EMAIL")
        let password = try XCTUnwrap(env["BEATEN_TEST_PASSWORD"], "set BEATEN_TEST_PASSWORD")

        // Signed in from an earlier run: sign out first.
        if app.tabBars.buttons["Profile"].waitForExistence(timeout: 5) {
            app.tabBars.buttons["Profile"].tap()
            app.buttons["Sign out"].firstMatch.tap()
            app.sheets.buttons["Sign out"].firstMatch.tap()
        }

        let emailField = app.textFields["Email"]
        XCTAssertTrue(emailField.waitForExistence(timeout: 10))
        shot("01-sign-in")
        emailField.tap()
        emailField.typeText(email)
        app.secureTextFields["Password"].tap()
        app.secureTextFields["Password"].typeText(password)
        app.buttons["Sign in"].tap()

        XCTAssertTrue(app.staticTexts["Recently beaten".uppercased()].waitForExistence(timeout: 15))
        sleep(2)
        shot("02-home")

        // Search and log a game.
        app.tabBars.buttons["Search"].tap()
        let search = app.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        search.tap()
        search.typeText("hades")
        let logButton = app.buttons["Log Hades"].firstMatch
        XCTAssertTrue(logButton.waitForExistence(timeout: 15))
        sleep(2)
        shot("03-search")
        logButton.tap()
        app.buttons["Beaten"].firstMatch.tap()
        XCTAssertTrue(app.navigationBars["Log game"].waitForExistence(timeout: 5))
        shot("04-log-sheet")
        app.buttons["Save"].tap()
        XCTAssertTrue(app.navigationBars["Log game"].waitForNonExistence(timeout: 10))

        // Game page.
        app.staticTexts["Hades"].firstMatch.tap()
        XCTAssertTrue(app.staticTexts["YOUR ENTRIES"].waitForExistence(timeout: 10))
        sleep(2)
        shot("05-game")

        // Diary has it; delete it again so the run can repeat.
        app.tabBars.buttons["Library"].tap()
        app.buttons["Diary"].firstMatch.tap()
        let row = app.buttons.containing(NSPredicate(format: "label BEGINSWITH 'Hades'")).firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 5))
        shot("06-diary")
        row.swipeLeft()
        app.buttons["Delete"].firstMatch.tap()
        app.buttons["Delete"].firstMatch.tap()
        XCTAssertTrue(row.waitForNonExistence(timeout: 10))

        app.tabBars.buttons["Library"].tap()
        app.buttons["Shelves"].firstMatch.tap()
        XCTAssertTrue(app.buttons["New shelf"].waitForExistence(timeout: 5))
        shot("07-shelves")

        app.tabBars.buttons["Profile"].tap()
        XCTAssertTrue(app.buttons["Find people"].waitForExistence(timeout: 5))
        app.swipeUp()
        XCTAssertTrue(app.buttons["Signed-in devices"].waitForExistence(timeout: 5))
        shot("08-profile")
    }

    // Sign-up in the app, against the dev server: ends at "Check your email"
    // (the unconfirmed account can't sign in, and expires unclaimed).
    func testRegister() throws {
        if app.tabBars.buttons["Profile"].waitForExistence(timeout: 5) {
            app.tabBars.buttons["Profile"].tap()
            app.buttons["Sign out"].firstMatch.tap()
            app.sheets.buttons["Sign out"].firstMatch.tap()
        }
        let create = app.buttons["Create an account"]
        XCTAssertTrue(create.waitForExistence(timeout: 10))
        create.tap()
        let stamp = String(Int(Date().timeIntervalSince1970))
        let fields: [(String, String)] = [
            ("register-name", "UI Signup"),
            ("register-username", "ui_signup_\(stamp.suffix(6))"),
            ("register-email", "ui-signup-\(stamp)@example.com"),
        ]
        for (label, value) in fields {
            let field = app.textFields[label]
            XCTAssertTrue(field.waitForExistence(timeout: 5))
            field.tap()
            field.typeText(value)
        }
        app.secureTextFields["register-password"].tap()
        app.secureTextFields["register-password"].typeText("Signup-pass-\(stamp)")
        shot("r1-register")
        app.buttons["Create account"].tap()
        XCTAssertTrue(app.staticTexts["Check your email"].waitForExistence(timeout: 20))
        shot("r2-check-email")
        app.buttons["Back to sign in"].tap()
        XCTAssertTrue(app.buttons["Create an account"].waitForExistence(timeout: 5))
    }
}
