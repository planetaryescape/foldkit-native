import XCTest

final class CounterUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launch()
        expect(app.staticTexts["counter.count"], label: "0")
        expect(app.staticTexts["counter.status"], label: "Ready")
    }

    override func tearDownWithError() throws {
        app.terminate()
        app = nil
    }

    func testImmediateIncrement() {
        let increment = app.buttons["counter.increment"]
        let delayed = app.buttons["counter.delayedIncrement"]
        XCTAssertTrue(increment.exists)
        XCTAssertTrue(increment.isEnabled)
        XCTAssertTrue(delayed.exists)
        XCTAssertTrue(delayed.isEnabled)
        increment.tap()
        expect(app.staticTexts["counter.count"], label: "1")
        expect(app.staticTexts["counter.status"], label: "Ready")
        attachScreenshot("Immediate increment")
    }

    func testDelayedIncrementShowsPendingAndCompletion() {
        app.buttons["counter.delayedIncrement"].tap()
        expect(app.staticTexts["counter.status"], label: "Running delayed increment…", timeout: 2)
        expect(app.staticTexts["counter.count"], label: "1", timeout: 5)
        expect(app.staticTexts["counter.status"], label: "Ready")
        XCTAssertTrue(app.buttons["counter.delayedIncrement"].isEnabled)
        attachScreenshot("Delayed increment completed")
    }

    func testImmediateIncrementWhileCommandIsPending() {
        app.buttons["counter.increment"].tap()
        expect(app.staticTexts["counter.count"], label: "1")
        app.buttons["counter.delayedIncrement"].tap()
        expect(app.staticTexts["counter.status"], label: "Running delayed increment…", timeout: 2)
        app.buttons["counter.increment"].tap()
        let responsiveState = NSPredicate { [weak self] _, _ in
            guard let self else { return false }
            return self.app.staticTexts["counter.count"].label == "2"
                && self.app.staticTexts["counter.status"].label == "Running delayed increment…"
        }
        let responsive = XCTNSPredicateExpectation(predicate: responsiveState, object: app)
        XCTAssertEqual(XCTWaiter.wait(for: [responsive], timeout: 2), .completed)
        expect(app.staticTexts["counter.count"], label: "3", timeout: 5)
        expect(app.staticTexts["counter.status"], label: "Ready")
        attachScreenshot("Responsive during delayed command")
    }

    private func expect(
        _ element: XCUIElement,
        label: String,
        timeout: TimeInterval = 5,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        let predicate = NSPredicate(format: "exists == true AND label == %@", label)
        let expectation = XCTNSPredicateExpectation(predicate: predicate, object: element)
        XCTAssertEqual(
            XCTWaiter.wait(for: [expectation], timeout: timeout),
            .completed,
            "Expected \(element) to show \(label)",
            file: file,
            line: line
        )
    }

    private func attachScreenshot(_ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
