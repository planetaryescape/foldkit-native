import Foundation
import JavaScriptCore

public enum CounterRuntimeError: Error, CustomStringConvertible {
    case wrongThread
    case unavailable
    case disposed
    case invalidLifecycle
    case bundleRead(String)
    case javaScript(String)
    case invalidSnapshot
    case invalidBridge

    public var description: String {
        switch self {
        case .wrongThread: return "JavaScriptCore must be used on the main thread"
        case .unavailable: return "Could not create JavaScriptCore context"
        case .disposed: return "Counter runtime is disposed"
        case .invalidLifecycle: return "Counter runtime has already started or has not started"
        case .bundleRead(let message): return "Could not read bundle: \(message)"
        case .javaScript(let message): return "JavaScript error: \(message)"
        case .invalidSnapshot: return "Invalid counter snapshot"
        case .invalidBridge: return "Bundle must expose FoldkitNativeCounter.start, dispatch, and dispose"
        }
    }
}

public enum CounterEvent: String {
    case increment = "TappedIncrement"
    case delayedIncrement = "TappedDelayedIncrement"

    public var json: String { "{\"_tag\":\"\(rawValue)\"}" }
}

public final class CounterRuntime {
    public private(set) var snapshot: CounterSnapshot?
    public private(set) var failure: CounterRuntimeError?
    public var scheduledTimerCount: Int { timers.count }
    public var onSnapshot: ((CounterSnapshot) -> Void)?
    public var onFailure: ((CounterRuntimeError) -> Void)?
    public var onLog: ((String) -> Void)?

    private var context: JSContext?
    private var bridge: JSValue?
    private var started = false
    private var isDisposed = false
    private var nextTimerID = 0
    private struct ScheduledCallback {
        let timer: Timer
        let callback: JSValue
        let arguments: JSValue
    }
    private var timers: [Int: ScheduledCallback] = [:]

    public init() {}

    deinit {
        for entry in timers.values { entry.timer.invalidate() }
    }

    public func start(bundleURL: URL) -> Result<Void, CounterRuntimeError> {
        guard Thread.isMainThread else { return .failure(.wrongThread) }
        guard !isDisposed else { return .failure(.disposed) }
        guard !started else { return .failure(.invalidLifecycle) }
        started = true
        guard let context = JSContext() else { return .failure(.unavailable) }
        self.context = context
        context.exceptionHandler = { [weak self] _, exception in
            self?.record(.javaScript(exception?.toString() ?? "Unknown exception"))
        }
        installGlobals(in: context)
        UTF8Prelude.install(in: context)
        if let failure { return .failure(failure) }
        let source: String
        do {
            source = try String(contentsOf: bundleURL, encoding: .utf8)
        } catch {
            return .failure(.bundleRead(error.localizedDescription))
        }
        context.evaluateScript(source, withSourceURL: bundleURL)
        if let failure { return .failure(failure) }
        let valid = context.evaluateScript("""
        typeof FoldkitNativeCounter === 'object' &&
        FoldkitNativeCounter !== null &&
        ['start', 'dispatch', 'dispose'].every(function (key) {
          return typeof FoldkitNativeCounter[key] === 'function';
        })
        """)?.toBool() ?? false
        guard valid else { return .failure(.invalidBridge) }
        bridge = context.objectForKeyedSubscript("FoldkitNativeCounter")
        return invoke("start", arguments: [])
    }

    public func dispatch(_ event: CounterEvent) -> Result<Void, CounterRuntimeError> {
        dispatch(json: event.json)
    }

    public func dispatch(json: String) -> Result<Void, CounterRuntimeError> {
        invoke("dispatch", arguments: [json])
    }

    public func dispose() -> Result<Void, CounterRuntimeError> {
        guard Thread.isMainThread else { return .failure(.wrongThread) }
        guard !isDisposed else { return .success(()) }
        let result: Result<Void, CounterRuntimeError>
        if bridge != nil {
            result = invoke("dispose", arguments: [])
        } else {
            result = .success(())
        }
        isDisposed = true
        for entry in timers.values { entry.timer.invalidate() }
        timers.removeAll()
        bridge = nil
        context?.exceptionHandler = nil
        context = nil
        onSnapshot = nil
        onFailure = nil
        onLog = nil
        return result
    }

    private func invoke(_ method: String, arguments: [Any]) -> Result<Void, CounterRuntimeError> {
        guard Thread.isMainThread else { return .failure(.wrongThread) }
        guard !isDisposed else { return .failure(.disposed) }
        guard let bridge, let context else { return .failure(.invalidLifecycle) }
        failure = nil
        context.exception = nil
        bridge.invokeMethod(method, withArguments: arguments)
        if let failure { return .failure(failure) }
        return .success(())
    }

    private func record(_ error: CounterRuntimeError) {
        failure = error
        onFailure?(error)
    }

    private func receive(_ value: JSValue) {
        guard !isDisposed else { return }
        guard value.isString, let text = value.toString(),
              let data = text.data(using: .utf8),
              let parsed = try? JSONDecoder().decode(CounterSnapshot.self, from: data) else {
            record(.invalidSnapshot)
            return
        }
        snapshot = parsed
        onSnapshot?(parsed)
    }

    private func installGlobals(in context: JSContext) {
        let render: @convention(block) (JSValue) -> Void = { [weak self] value in
            self?.receive(value)
        }
        let log: @convention(block) (String) -> Void = { [weak self] message in
            self?.onLog?(message)
        }
        let schedule: @convention(block) (JSValue, Double, JSValue) -> Int = {
            [weak self] callback, milliseconds, arguments in
            guard let self, !self.isDisposed else { return 0 }
            self.nextTimerID += 1
            let id = self.nextTimerID
            let seconds = min(max(milliseconds.isFinite ? milliseconds : 0, 0), 2_147_483_647) / 1000
            let timer = Timer(timeInterval: seconds, repeats: false) { [weak self] _ in
                self?.fireTimer(id)
            }
            self.timers[id] = ScheduledCallback(timer: timer, callback: callback, arguments: arguments)
            RunLoop.main.add(timer, forMode: .common)
            return id
        }
        let cancel: @convention(block) (Int) -> Void = { [weak self] id in
            self?.timers.removeValue(forKey: id)?.timer.invalidate()
        }
        context.setObject(render, forKeyedSubscript: "__foldkitRender" as NSString)
        context.setObject(log, forKeyedSubscript: "__foldkitLog" as NSString)
        context.setObject(schedule, forKeyedSubscript: "__foldkitSetTimeout" as NSString)
        context.setObject(cancel, forKeyedSubscript: "__foldkitClearTimeout" as NSString)
        context.evaluateScript("""
        globalThis.setTimeout = function (callback, delay) {
          if (typeof callback !== 'function') throw new TypeError('Timer callback must be a function');
          return __foldkitSetTimeout(callback, Number(delay) || 0, Array.prototype.slice.call(arguments, 2));
        };
        globalThis.clearTimeout = function (id) { __foldkitClearTimeout(Number(id) || 0); };
        """)
    }

    private func fireTimer(_ id: Int) {
        guard !isDisposed, let entry = timers.removeValue(forKey: id), let context else { return }
        context.exception = nil
        entry.callback.invokeMethod("apply", withArguments: [NSNull(), entry.arguments])
    }
}
