import UIKit

final class CounterViewController: UIViewController {
    private let runtime = CounterRuntime()
    private let countLabel = UILabel()
    private let statusLabel = UILabel()
    private let incrementButton = UIButton(type: .system)
    private let delayedButton = UIButton(type: .system)

    override func viewDidLoad() {
        super.viewDidLoad()
        configureView()
        runtime.onSnapshot = { [weak self] snapshot in self?.render(snapshot) }
        runtime.onFailure = { [weak self] error in self?.showFailure(error.description) }
        runtime.onLog = { message in NSLog("[Foldkit] %@", message) }
        guard let bundleURL = Bundle.main.url(forResource: "counter", withExtension: "js") else {
            showFailure("Missing bundled counter.js")
            return
        }
        handle(runtime.start(bundleURL: bundleURL))
    }

    func shutdown() {
        _ = runtime.dispose()
    }

    private func configureView() {
        view.backgroundColor = .systemBackground
        let titleLabel = UILabel()
        titleLabel.text = "Foldkit Native"
        titleLabel.font = .preferredFont(forTextStyle: .largeTitle)
        titleLabel.textAlignment = .center
        titleLabel.adjustsFontForContentSizeCategory = true
        countLabel.text = "Loading"
        countLabel.font = .monospacedDigitSystemFont(ofSize: 64, weight: .semibold)
        countLabel.textAlignment = .center
        countLabel.accessibilityIdentifier = "counter.count"
        statusLabel.font = .preferredFont(forTextStyle: .body)
        statusLabel.adjustsFontForContentSizeCategory = true
        statusLabel.textAlignment = .center
        statusLabel.numberOfLines = 0
        statusLabel.accessibilityIdentifier = "counter.status"
        incrementButton.configuration = .filled()
        incrementButton.setTitle("Increment", for: .normal)
        incrementButton.accessibilityIdentifier = "counter.increment"
        incrementButton.addTarget(self, action: #selector(increment), for: .touchUpInside)
        delayedButton.configuration = .bordered()
        delayedButton.setTitle("Delayed increment", for: .normal)
        delayedButton.accessibilityIdentifier = "counter.delayedIncrement"
        delayedButton.addTarget(self, action: #selector(delayedIncrement), for: .touchUpInside)
        let stack = UIStackView(arrangedSubviews: [
            titleLabel, countLabel, statusLabel, incrementButton, delayedButton
        ])
        stack.axis = .vertical
        stack.spacing = 24
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        let safe = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            stack.centerYAnchor.constraint(equalTo: safe.centerYAnchor),
            stack.leadingAnchor.constraint(equalTo: safe.leadingAnchor, constant: 24),
            stack.trailingAnchor.constraint(equalTo: safe.trailingAnchor, constant: -24),
            stack.topAnchor.constraint(greaterThanOrEqualTo: safe.topAnchor, constant: 24),
            stack.bottomAnchor.constraint(lessThanOrEqualTo: safe.bottomAnchor, constant: -24),
            incrementButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 48),
            delayedButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 48)
        ])
        incrementButton.isEnabled = false
        delayedButton.isEnabled = false
    }

    private func render(_ snapshot: CounterSnapshot) {
        countLabel.text = String(snapshot.count)
        statusLabel.text = snapshot.pending > 0 ? "Running delayed increment…" : "Ready"
        incrementButton.isEnabled = true
        delayedButton.isEnabled = snapshot.pending == 0
    }

    private func showFailure(_ message: String) {
        statusLabel.text = message
        incrementButton.isEnabled = false
        delayedButton.isEnabled = false
    }

    private func handle(_ result: Result<Void, CounterRuntimeError>) {
        if case .failure(let error) = result { showFailure(error.description) }
    }

    @objc private func increment() { handle(runtime.dispatch(.increment)) }
    @objc private func delayedIncrement() { handle(runtime.dispatch(.delayedIncrement)) }
}
