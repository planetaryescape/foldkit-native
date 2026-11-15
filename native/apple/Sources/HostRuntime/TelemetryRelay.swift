import Foundation

final class TelemetryRelay: NSObject, URLSessionDataDelegate {
    private struct Configuration {
        let url: URL
        let token: String

        static func parse(_ environment: [String: String]) -> Configuration? {
            guard let text = environment["FOLDKIT_TELEMETRY_RELAY_URL"],
                  text.utf8.count <= 2048,
                  let components = URLComponents(string: text),
                  components.user == nil, components.password == nil,
                  components.query == nil, components.fragment == nil,
                  let scheme = components.scheme?.lowercased(),
                  let host = components.host?.lowercased(), !host.isEmpty,
                  scheme == "https" || (
                    scheme == "http" && ["localhost", "127.0.0.1", "::1", "[::1]"].contains(host)
                  ),
                  let url = components.url,
                  let token = environment["FOLDKIT_TELEMETRY_SESSION_TOKEN"],
                  (32...256).contains(token.utf8.count),
                  token.utf8.allSatisfy({ (33...126).contains($0) }) else { return nil }
            return Configuration(url: url, token: token)
        }
    }

    private let configuration: Configuration
    private let diagnostics: TelemetryDiagnostics
    private let lock = NSLock()
    private var completions: [Int: () -> Void] = [:]
    private var receivedResponses: Set<Int> = []
    private var session: URLSession?
    private var closed = false

    static func make(environment: [String: String], diagnostics: TelemetryDiagnostics) -> TelemetryRelay? {
        guard let configuration = Configuration.parse(environment) else { return nil }
        return TelemetryRelay(configuration: configuration, diagnostics: diagnostics)
    }

    private init(configuration: Configuration, diagnostics: TelemetryDiagnostics) {
        self.configuration = configuration
        self.diagnostics = diagnostics
        super.init()
        let settings = URLSessionConfiguration.ephemeral
        settings.timeoutIntervalForRequest = 1
        settings.timeoutIntervalForResource = 1.5
        settings.httpMaximumConnectionsPerHost = 1
        settings.httpShouldSetCookies = false
        settings.httpCookieStorage = nil
        settings.urlCredentialStorage = nil
        settings.urlCache = nil
        settings.requestCachePolicy = .reloadIgnoringLocalCacheData
        let delegateQueue = OperationQueue()
        delegateQueue.maxConcurrentOperationCount = 1
        delegateQueue.qualityOfService = .utility
        session = URLSession(configuration: settings, delegate: self, delegateQueue: delegateQueue)
    }

    func send(_ data: Data, completion: @escaping () -> Void) {
        lock.lock()
        guard !closed, let session else {
            lock.unlock()
            completion()
            return
        }
        var request = URLRequest(url: configuration.url, timeoutInterval: 1)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(configuration.token)", forHTTPHeaderField: "Authorization")
        request.httpBody = data
        let task = session.dataTask(with: request)
        completions[task.taskIdentifier] = completion
        lock.unlock()
        task.resume()
    }

    func shutdown() {
        lock.lock()
        closed = true
        lock.unlock()
        session?.invalidateAndCancel()
    }

    func urlSession(
        _ session: URLSession, task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest,
        completionHandler: @escaping (URLRequest?) -> Void
    ) {
        diagnostics.report(.relayFailure)
        completionHandler(nil)
    }

    func urlSession(
        _ session: URLSession, dataTask: URLSessionDataTask,
        didReceive response: URLResponse,
        completionHandler: @escaping (URLSession.ResponseDisposition) -> Void
    ) {
        lock.lock()
        receivedResponses.insert(dataTask.taskIdentifier)
        lock.unlock()
        if let response = response as? HTTPURLResponse, (200...299).contains(response.statusCode) {
            completionHandler(.cancel)
            return
        }
        diagnostics.report(.relayFailure)
        completionHandler(.cancel)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        lock.lock()
        let completion = completions.removeValue(forKey: task.taskIdentifier)
        let receivedResponse = receivedResponses.remove(task.taskIdentifier) != nil
        let stopped = closed
        lock.unlock()
        if error != nil, !receivedResponse, !stopped { diagnostics.report(.relayFailure) }
        completion?()
    }
}
