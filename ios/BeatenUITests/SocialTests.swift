import XCTest

// Activity, reactions, comments, profiles, following and notifications
// against the dev server, with an account that follows ui_pal, who has a
// spoiler review of Celeste and has just commented on one of this
// account's reviews (BEATEN_TEST_EMAIL / _PASSWORD, as ChronicleTests).
// Puts everything back as it found it, so it can repeat (re-seed the
// comment to see the notification again).
final class SocialTests: XCTestCase {
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

    func testSocial() throws {
        try signIn()
        app.tabBars.buttons["Activity"].tap()
        let spoiler = app.buttons["Show review (contains spoilers)"].firstMatch
        XCTAssertTrue(spoiler.waitForExistence(timeout: 15))
        spoiler.tap()
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS 'summit'")).firstMatch.waitForExistence(timeout: 5))

        // React, see it count, then take it back at the end.
        app.buttons["React"].firstMatch.tap()
        app.buttons.containing(NSPredicate(format: "label CONTAINS 'Fire'")).firstMatch.tap()
        XCTAssertTrue(app.buttons["Fire, 1"].waitForExistence(timeout: 10))
        shot("s1-feed")

        // Comment, then delete it.
        app.buttons.containing(NSPredicate(format: "label ENDSWITH 'omment' OR label ENDSWITH 'omments'")).firstMatch.tap()
        XCTAssertTrue(app.navigationBars["Comments"].waitForExistence(timeout: 10))
        let field = app.textFields["Add a comment…"]
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        field.tap()
        field.typeText("Nailed it. That ending!")
        app.buttons["Post comment"].tap()
        let posted = app.staticTexts["Nailed it. That ending!"]
        XCTAssertTrue(posted.waitForExistence(timeout: 10))
        shot("s2-comments")
        app.staticTexts["Comments"].firstMatch.tap()
        posted.swipeLeft()
        app.buttons["Delete"].firstMatch.tap()
        XCTAssertTrue(app.staticTexts["No comments yet. Say something nice."].waitForExistence(timeout: 10))
        app.buttons["Done"].tap()
        XCTAssertTrue(app.buttons["Comment"].firstMatch.waitForExistence(timeout: 5))

        app.buttons["Fire, 1"].tap()
        XCTAssertTrue(app.buttons["Fire, 1"].waitForNonExistence(timeout: 10))

        // Their profile: the same review, with the same reactions; react
        // there and the feed shows it too.
        app.buttons["Pixel Pal"].firstMatch.tap()
        XCTAssertTrue(app.staticTexts["Recent reviews".uppercased()].waitForExistence(timeout: 15))
        app.swipeUp()
        app.buttons["React"].firstMatch.tap()
        app.buttons.containing(NSPredicate(format: "label CONTAINS 'Love'")).firstMatch.tap()
        XCTAssertTrue(app.buttons["Love, 1"].waitForExistence(timeout: 10))
        shot("s3-profile")
        app.navigationBars.buttons.firstMatch.tap()
        app.swipeDown()
        XCTAssertTrue(app.buttons["Love, 1"].waitForExistence(timeout: 10))
        app.buttons["Love, 1"].tap()
        XCTAssertTrue(app.buttons["Love, 1"].waitForNonExistence(timeout: 10))
        app.buttons["Pixel Pal"].firstMatch.tap()
        XCTAssertTrue(app.buttons["Following"].waitForExistence(timeout: 15))
        app.swipeDown()
        app.buttons["Following"].tap()
        app.buttons["Unfollow"].firstMatch.tap()
        XCTAssertTrue(app.buttons["Follow"].waitForExistence(timeout: 10))
        app.buttons["Follow"].tap()
        XCTAssertTrue(app.buttons["Following"].waitForExistence(timeout: 10))
        app.buttons["0 following"].firstMatch.tap()
        XCTAssertTrue(app.navigationBars["Following"].waitForExistence(timeout: 10))
        app.navigationBars.buttons.firstMatch.tap()

        // Notifications: Pixel Pal's comment on one of your reviews opens it.
        app.navigationBars.buttons.firstMatch.tap()
        let bell = app.buttons.containing(NSPredicate(format: "label BEGINSWITH 'Notifications'")).firstMatch
        XCTAssertTrue(bell.waitForExistence(timeout: 10))
        bell.tap()
        let note = app.staticTexts.containing(NSPredicate(format: "label CONTAINS 'commented on your review'")).firstMatch
        XCTAssertTrue(note.waitForExistence(timeout: 10))
        shot("s6-notifications")
        note.tap()
        sleep(3)
        shot("s7-review")
        XCTAssertTrue(app.descendants(matching: .any).containing(NSPredicate(format: "label CONTAINS 'Totally agree'")).firstMatch.waitForExistence(timeout: 10))
        app.navigationBars.buttons.firstMatch.tap()
        app.buttons["Email settings"].tap()
        XCTAssertTrue(app.staticTexts["EMAIL ME ABOUT"].waitForExistence(timeout: 10) || app.staticTexts["Email me about"].exists)
        shot("s8-email-settings")
        app.navigationBars.buttons.firstMatch.tap()
        app.navigationBars.buttons.firstMatch.tap()
        app.buttons["Pixel Pal"].firstMatch.tap()
        XCTAssertTrue(app.buttons["Following"].waitForExistence(timeout: 15))

        // Find people.
        app.navigationBars.buttons.firstMatch.tap()
        app.buttons["Find people"].firstMatch.tap()
        let search = app.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        search.tap()
        search.typeText("ui_pa")
        XCTAssertTrue(app.staticTexts["@ui_pal"].waitForExistence(timeout: 10))
        shot("s4-people")
        search.typeText("\n")

        // Your own follower counts on the Profile tab.
        app.tabBars.buttons["Profile"].tap()
        XCTAssertTrue(app.buttons["1 following"].waitForExistence(timeout: 10))
        shot("s5-profile-tab")
    }
}
