import Darwin
import Foundation

struct SafeTelemetryRecord {
    let fields: [String: String]

    static func parse(_ text: String) -> SafeTelemetryRecord? {
        guard text.utf8.count <= 16 * 1024,
              let fields = try? JSONDecoder().decode([String: String].self, from: Data(text.utf8)),
              let outcome = fields["outcome"],
              ["success", "failure", "cancelled"].contains(outcome) else { return nil }
        let required: Set<String>
        let optional: Set<String>
        switch fields["_tag"] {
        case "Span":
            required = ["_tag", "name", "traceId", "spanId", "startTimeUnixNano", "endTimeUnixNano", "outcome"]
            optional = ["parentSpanId", "messageTag", "commandName"]
            guard let name = fields["name"],
                  ["Counter.start", "Counter.dispatch", "Counter.command", "Counter.complete", "Counter.dispose", "DelayedIncrement"].contains(name),
                  isNonzeroID(fields["traceId"], digits: 32),
                  isNonzeroID(fields["spanId"], digits: 16),
                  let start = parseTimestamp(fields["startTimeUnixNano"]),
                  let end = parseTimestamp(fields["endTimeUnixNano"]),
                  end >= start else { return nil }
            if let parent = fields["parentSpanId"], !isNonzeroID(parent, digits: 16) { return nil }
            if let tag = fields["messageTag"],
               !["TappedIncrement", "TappedDelayedIncrement", "CompletedDelayedIncrement"].contains(tag) { return nil }
            if let command = fields["commandName"], command != "DelayedIncrement" { return nil }
        case "Event":
            required = ["_tag", "name", "outcome", "timestampUnixNano"]
            optional = ["failureTag"]
            guard let name = fields["name"],
                  ["host.start", "host.started", "host.failure", "host.disposed", "host.invalid_message"].contains(name),
                  parseTimestamp(fields["timestampUnixNano"]) != nil else { return nil }
            if let tag = fields["failureTag"],
               !["wrongThread", "unavailable", "disposed", "invalidLifecycle", "bundleRead", "javaScript", "invalidSnapshot", "invalidBridge", "invalidMessage"].contains(tag) { return nil }
        default: return nil
        }
        let keys = Set(fields.keys)
        guard required.isSubset(of: keys), keys.isSubset(of: required.union(optional)) else { return nil }
        return SafeTelemetryRecord(fields: fields)
    }

    private static func isNonzeroID(_ value: String?, digits: Int) -> Bool {
        guard let value, matches(value, pattern: "^[0-9a-f]{\(digits)}$") else { return false }
        return value.contains { $0 != "0" }
    }

    private static func parseTimestamp(_ value: String?) -> UInt64? {
        guard let value, matches(value, pattern: "^[0-9]{1,20}$") else { return nil }
        return UInt64(value)
    }

    private static func matches(_ value: String?, pattern: String) -> Bool {
        guard let value else { return false }
        guard let range = value.range(of: pattern, options: .regularExpression) else { return false }
        return range == value.startIndex..<value.endIndex
    }
}

public final class HostTelemetry {
    private let queue = DispatchQueue(label: "foldkit.telemetry", qos: .utility)
    private let lock = NSLock()
    private let pending = DispatchGroup()
    private let slots = DispatchSemaphore(value: 128)
    private let channel: DispatchIO?
    private let relay: TelemetryRelay?
    private let diagnostics: TelemetryDiagnostics
    private var closed = false

    public init(
        environment: [String: String] = ProcessInfo.processInfo.environment,
        output: FileHandle = .standardOutput
    ) {
        let diagnostics = TelemetryDiagnostics()
        self.diagnostics = diagnostics
        relay = TelemetryRelay.make(environment: environment, diagnostics: diagnostics)
        if environment["FOLDKIT_TELEMETRY_STDOUT"] == "1" {
            let descriptor = dup(output.fileDescriptor)
            if descriptor >= 0 {
                _ = fcntl(descriptor, F_SETNOSIGPIPE, 1)
                channel = DispatchIO(type: .stream, fileDescriptor: descriptor, queue: queue) { _ in
                    Darwin.close(descriptor)
                }
            } else {
                channel = nil
                diagnostics.report(.stdoutFailure)
            }
        } else {
            channel = nil
        }
    }

    deinit {
        channel?.close(flags: .stop)
        relay?.shutdown()
    }

    var enabled: Bool { channel != nil || relay != nil }

    func receive(_ text: String) {
        guard enabled, let record = SafeTelemetryRecord.parse(text) else { return }
        send(record)
    }

    func event(_ name: String, outcome: String = "success", failureTag: String? = nil) {
        guard enabled else { return }
        let seconds = Date().timeIntervalSince1970
        var fields = [
            "_tag": "Event", "name": name, "outcome": outcome,
            "timestampUnixNano": String(UInt64(seconds * 1_000_000_000))
        ]
        if let failureTag { fields["failureTag"] = failureTag }
        guard let data = try? JSONEncoder().encode(fields),
              let text = String(data: data, encoding: .utf8),
              let record = SafeTelemetryRecord.parse(text) else { return }
        send(record)
    }

    private func send(_ record: SafeTelemetryRecord) {
        guard enabled, let json = try? JSONEncoder().encode(record.fields) else { return }
        lock.lock()
        guard !closed else {
            lock.unlock()
            return
        }
        guard slots.wait(timeout: .now()) == .success else {
            lock.unlock()
            diagnostics.report(.queueFull)
            return
        }
        pending.enter()
        lock.unlock()
        queue.async { [self] in
            let delivery = DispatchGroup()
            if let channel {
                delivery.enter()
                var line = Data("FOLDKIT_TELEMETRY ".utf8)
                line.append(json)
                line.append(10)
                let data = line.withUnsafeBytes { DispatchData(bytes: $0) }
                channel.write(offset: 0, data: data, queue: queue) { [diagnostics] done, _, error in
                    if error != 0 { diagnostics.report(.stdoutFailure) }
                    if done { delivery.leave() }
                }
            }
            if let relay {
                delivery.enter()
                relay.send(json) { delivery.leave() }
            }
            delivery.notify(queue: queue) { [self] in
                slots.signal()
                pending.leave()
            }
        }
    }

    public func shutdown(completion: @escaping () -> Void = {}) {
        guard enabled else {
            DispatchQueue.main.async(execute: completion)
            return
        }
        lock.lock()
        closed = true
        lock.unlock()
        let finish = TelemetryCompletion(completion)
        pending.notify(queue: .main) { [channel, relay] in
            channel?.close()
            relay?.shutdown()
            finish.run()
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [channel, relay] in
            channel?.close(flags: .stop)
            relay?.shutdown()
            finish.run()
        }
    }
}

private final class TelemetryCompletion {
    private var completion: (() -> Void)?

    init(_ completion: @escaping () -> Void) { self.completion = completion }

    func run() {
        let action = completion
        completion = nil
        action?()
    }
}
