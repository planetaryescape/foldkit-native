import CounterRuntime
import Darwin
import Foundation

enum ProbeError: Error, CustomStringConvertible {
    case assertion(String)

    var description: String {
        switch self {
        case .assertion(let message): return message
        }
    }
}

func require(_ condition: @autoclosure () -> Bool, _ message: String) throws {
    guard condition() else { throw ProbeError.assertion(message) }
}

func pump(until condition: () -> Bool, timeout: TimeInterval) -> Bool {
    let deadline = ProcessInfo.processInfo.systemUptime + timeout
    while !condition(), ProcessInfo.processInfo.systemUptime < deadline {
        _ = RunLoop.main.run(mode: .default, before: Date().addingTimeInterval(0.01))
    }
    return condition()
}

func verifySnapshotParser() throws {
    let invalid = [
        "{}",
        "{\"count\":true,\"pending\":0}",
        "{\"count\":1.5,\"pending\":0}",
        "{\"count\":-1,\"pending\":0}",
        "{\"count\":9007199254740992,\"pending\":0}",
        "{\"count\":0,\"pending\":false}",
        "{\"count\":0,\"pending\":-1}",
        "{\"count\":0,\"pending\":0,\"extra\":1}",
        "{\"count\":null,\"pending\":0}"
    ]
    for text in invalid {
        do {
            _ = try JSONDecoder().decode(CounterSnapshot.self, from: Data(text.utf8))
        } catch {
            continue
        }
        throw ProbeError.assertion("Snapshot parser accepted \(text)")
    }
}

func verifyRenderBoundary() throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }
    let bundleURL = directory.appendingPathComponent("invalid-counter.js")
    let source = """
    globalThis.FoldkitNativeCounter = {
      start: function () { __foldkitRender('{"count":"wrong","pending":0}'); },
      dispatch: function () {},
      dispose: function () {}
    };
    """
    try source.write(to: bundleURL, atomically: true, encoding: .utf8)
    let runtime = CounterRuntime()
    defer { _ = runtime.dispose() }
    switch runtime.start(bundleURL: bundleURL) {
    case .failure(.invalidSnapshot): break
    default: throw ProbeError.assertion("Native render boundary accepted an invalid snapshot")
    }
    try require(runtime.snapshot == nil, "Invalid snapshot reached native state")
}

func verifyUTF8Host() throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }
    let bundleURL = directory.appendingPathComponent("utf8-probe.js")
    let source = #"""
    (function () {
      function check(condition, message) {
        if (!condition) throw new Error('UTF-8 probe: ' + message);
      }
      function throwsTypeError(action, message) {
        var rejected = false;
        try { action(); } catch (error) { rejected = error instanceof TypeError; }
        check(rejected, message);
      }
      globalThis.FoldkitNativeCounter = {
        start: function () {
          var encoder = new TextEncoder();
          check(encoder.encoding === 'utf-8', 'encoder encoding');
          check(encoder.encode() instanceof Uint8Array, 'encoder result type');
          check(encoder.encode().length === 0, 'encoder default');
          check(Array.from(encoder.encode('A😀é')).join(',') === '65,240,159,152,128,195,169', 'astral encoding');
          check(Array.from(encoder.encode('\ud800X\udc00')).join(',') === '239,191,189,88,239,191,189', 'surrogate replacement');
          var strict = new TextDecoder(' UTF-8 ', { fatal: true });
          check(strict.encoding === 'utf-8' && strict.fatal && !strict.ignoreBOM, 'decoder properties');
          check(strict.decode(new Uint8Array([65,240,159,152,128,195,169])) === 'A😀é', 'astral decoding');
          check(strict.decode() === '', 'decoder default');
          [[0xff], [0xe2,0x82], [0xc0,0x80], [0xed,0xa0,0x80], [0xf4,0x90,0x80,0x80]].forEach(function (bytes) {
            throwsTypeError(function () { strict.decode(new Uint8Array(bytes)); }, 'fatal malformed bytes');
          });
          check(new TextDecoder().decode(new Uint8Array([0xe2,0x28,0xa1])) === '\ufffd(\ufffd', 'replacement decoding');
          var buffer = new Uint8Array([120,0xe2,0x82,0xac,121]).buffer;
          check(strict.decode(new Uint8Array(buffer, 1, 3)) === '€', 'typed array byte range');
          check(strict.decode(new DataView(buffer, 1, 3)) === '€', 'DataView byte range');
          check(strict.decode(new Uint8Array([65]).buffer) === 'A', 'ArrayBuffer input');
          var bom = new Uint8Array([0xef,0xbb,0xbf,65]);
          check(strict.decode(bom) === 'A', 'default BOM removal');
          check(strict.decode(bom) === 'A', 'nonstreaming BOM state reset');
          check(new TextDecoder('utf8', { ignoreBOM: true }).decode(bom) === '\ufeffA', 'BOM retention');
          check(strict.decode(new Uint8Array([0xef,0xbb,0xbf,0xef,0xbb,0xbf,65])) === '\ufeffA', 'remove only initial BOM');
          throwsTypeError(function () { strict.decode(new Uint8Array(), { stream: true }); }, 'reject streaming');
          throwsTypeError(function () { strict.decode([65]); }, 'reject non-buffer input');
          var unsupported = false;
          try { new TextDecoder('latin1'); } catch (error) { unsupported = error instanceof RangeError; }
          check(unsupported, 'reject unsupported encoding');
          __foldkitRender('{"count":0,"pending":0}');
        },
        dispatch: function () {},
        dispose: function () {}
      };
    })();
    """#
    try source.write(to: bundleURL, atomically: true, encoding: .utf8)
    let runtime = CounterRuntime()
    defer { _ = runtime.dispose() }
    try runtime.start(bundleURL: bundleURL).get()
    try require(runtime.snapshot?.count == 0, "UTF-8 fixture did not finish")
}

func flushTelemetry(_ runtime: CounterRuntime) throws {
    var flushed = false
    runtime.shutdownTelemetry { flushed = true }
    try require(pump(until: { flushed }, timeout: 2.2), "Telemetry shutdown exceeded its deadline")
}

func verifyTelemetry() throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }
    let bundleURL = directory.appendingPathComponent("telemetry-probe.js")
    let span: [String: String] = [
        "_tag": "Span", "name": "Counter.dispatch",
        "traceId": "0123456789abcdef0123456789abcdef",
        "spanId": "0123456789abcdef", "parentSpanId": "fedcba9876543210",
        "startTimeUnixNano": "1794740000000000000", "endTimeUnixNano": "1794740000000000001",
        "outcome": "success", "messageTag": "TappedIncrement"
    ]
    let valid = String(decoding: try JSONEncoder().encode(span), as: UTF8.self)
    var malformed = [
        "{}", "not json", "null", "[]",
        "{\"_tag\":\"Span\",\"name\":true}",
        "{\"_tag\":\"Event\",\"name\":\"host.failure\",\"outcome\":\"failure\",\"timestampUnixNano\":\"1\",\"failureTag\":\"secret-sentinel-telemetry\"}",
        "{\"_tag\":\"Event\",\"name\":\"host.failure\",\"outcome\":\"failure\",\"timestampUnixNano\":\"1\",\"extra\":\"secret-sentinel-telemetry\"}",
        "{\"_tag\":\"Event\",\"name\":\"host.failure\",\"outcome\":\"failure\",\"timestampUnixNano\":\"18446744073709551616\"}",
        String(repeating: "x", count: 16 * 1024 + 1)
    ]
    malformed.append(valid + String(repeating: " ", count: 16 * 1024))
    for (key, value) in [
        ("traceId", "secret-sentinel-telemetry"),
        ("traceId", String(repeating: "0", count: 32)),
        ("spanId", "0123456789abcdef\n"),
        ("spanId", String(repeating: "0", count: 16)),
        ("parentSpanId", "secret-sentinel-telemetry"),
        ("parentSpanId", String(repeating: "0", count: 16)),
        ("name", "secret-sentinel-telemetry"),
        ("startTimeUnixNano", "179474000000000000000"),
        ("startTimeUnixNano", "18446744073709551616"),
        ("endTimeUnixNano", "18446744073709551616"),
        ("endTimeUnixNano", "1794739999999999999"),
        ("outcome", "unknown"),
        ("commandName", "secret-sentinel-telemetry"),
        ("messageTag", "secret-sentinel-telemetry"),
        ("extra", "secret-sentinel-telemetry")
    ] {
        var fields = span
        fields[key] = value
        malformed.append(String(decoding: try JSONEncoder().encode(fields), as: UTF8.self))
    }
    var nonString = span
    nonString.removeValue(forKey: "spanId")
    malformed.append(String(decoding: try JSONEncoder().encode(nonString), as: UTF8.self))
    let records = String(decoding: try JSONEncoder().encode(malformed + [valid]), as: UTF8.self)
    let source = """
    globalThis.FoldkitNativeCounter = {
      start: function () {
        if (typeof __foldkitTelemetry === 'function') {
          \(records).forEach(function (record) { __foldkitTelemetry(record); });
          __foldkitTelemetry({ secret: 'secret-sentinel-telemetry' });
        }
        __foldkitRender('{"count":0,"pending":0}');
      },
      dispatch: function () { throw new Error('secret-sentinel-telemetry'); },
      dispose: function () {}
    };
    """
    try source.write(to: bundleURL, atomically: true, encoding: .utf8)
    for enabled in [false, true] {
        let outputURL = directory.appendingPathComponent(enabled ? "enabled.jsonl" : "disabled.jsonl")
        _ = FileManager.default.createFile(atPath: outputURL.path, contents: nil)
        let output = try FileHandle(forWritingTo: outputURL)
        defer { try? output.close() }
        let telemetry = HostTelemetry(
            environment: enabled ? ["FOLDKIT_TELEMETRY_STDOUT": "1"] : [:],
            output: output
        )
        let runtime = CounterRuntime(telemetry: telemetry)
        try runtime.start(bundleURL: bundleURL).get()
        try require(runtime.snapshot?.count == 0, "Malformed telemetry affected startup")
        switch runtime.dispatch(.increment) {
        case .failure(.javaScript): break
        default: throw ProbeError.assertion("Telemetry replaced the JavaScript failure result")
        }
        try runtime.dispose().get()
        try flushTelemetry(runtime)
        let text = try String(contentsOf: outputURL, encoding: .utf8)
        try require(!text.contains("secret-sentinel-telemetry"), "Raw exception or malformed fields leaked into telemetry")
        if !enabled {
            try require(text.isEmpty, "Disabled telemetry produced output")
            continue
        }
        var spans = 0
        var names: [String] = []
        for line in text.split(separator: "\n") {
            let prefix = "FOLDKIT_TELEMETRY "
            try require(line.hasPrefix(prefix), "Telemetry output was not framed")
            let fields = try JSONDecoder().decode(
                [String: String].self, from: Data(line.dropFirst(prefix.count).utf8)
            )
            names.append(fields["name"] ?? "")
            if fields["_tag"] == "Span" {
                spans += 1
                try require(fields == span, "Telemetry span projection changed")
            }
            if fields["name"] == "host.failure" {
                try require(fields["failureTag"] == "javaScript", "Failure did not retain its safe tag")
            }
        }
        try require(spans == 1, "Malformed span accepted or valid span dropped")
        for name in ["host.start", "host.started", "host.failure", "host.disposed"] {
            try require(names.contains(name), "Missing native telemetry lifecycle event: \(name)")
        }
    }
    let failedOutput = try FileHandle(forReadingFrom: bundleURL)
    defer { try? failedOutput.close() }
    let failedExporter = CounterRuntime(
        telemetry: HostTelemetry(environment: ["FOLDKIT_TELEMETRY_STDOUT": "1"], output: failedOutput)
    )
    try failedExporter.start(bundleURL: bundleURL).get()
    try failedExporter.dispose().get()
    try flushTelemetry(failedExporter)

    let pipe = Pipe()
    let blocked = CounterRuntime(
        telemetry: HostTelemetry(
            environment: ["FOLDKIT_TELEMETRY_STDOUT": "1"], output: pipe.fileHandleForWriting
        )
    )
    let floodURL = directory.appendingPathComponent("telemetry-flood.js")
    let literal = String(decoding: try JSONEncoder().encode(valid), as: UTF8.self)
    try """
    globalThis.FoldkitNativeCounter = {
      start: function () {
        for (var i = 0; i < 10000; i++) __foldkitTelemetry(\(literal));
        __foldkitRender('{"count":0,"pending":0}');
      },
      dispatch: function () {},
      dispose: function () {}
    };
    """.write(to: floodURL, atomically: true, encoding: .utf8)
    try blocked.start(bundleURL: floodURL).get()
    try require(blocked.snapshot?.count == 0, "Backpressured telemetry affected counter startup")
    try blocked.dispose().get()
    try flushTelemetry(blocked)
    try pipe.fileHandleForReading.close()
    try pipe.fileHandleForWriting.close()

    let configURL = directory.appendingPathComponent("telemetry-config.js")
    try """
    globalThis.FoldkitNativeCounter = {
      start: function () {
        if (typeof __foldkitTelemetry !== 'undefined') throw new Error('Unexpected relay activation');
        __foldkitRender('{"count":0,"pending":0}');
      },
      dispatch: function () {},
      dispose: function () {}
    };
    """.write(to: configURL, atomically: true, encoding: .utf8)
    let testToken = String(repeating: "synthetic-private-run-token", count: 2)
    for (url, token) in [
        ("http://example.invalid/telemetry", testToken),
        ("http://127.0.0.1.example.invalid/telemetry", testToken),
        ("https://user:secret-sentinel-telemetry@example.invalid", testToken),
        ("https://example.invalid?token=secret-sentinel-telemetry", testToken),
        ("https://example.invalid#secret-sentinel-telemetry", testToken),
        ("not a URL", testToken),
        ("http://127.0.0.1:1", ""),
        ("http://127.0.0.1:1", "too-short"),
        ("http://127.0.0.1:1", String(repeating: "x", count: 257)),
        ("http://127.0.0.1:1", testToken + "\n")
    ] {
        let runtime = CounterRuntime(telemetry: HostTelemetry(environment: [
            "FOLDKIT_TELEMETRY_RELAY_URL": url,
            "FOLDKIT_TELEMETRY_SESSION_TOKEN": token
        ]))
        try runtime.start(bundleURL: configURL).get()
        try runtime.dispose().get()
        try flushTelemetry(runtime)
    }
    let requiredRelayURL = directory.appendingPathComponent("relay-required.js")
    let counterSource = try String(contentsOf: bundleURL, encoding: .utf8)
    try """
    if (typeof __foldkitTelemetry !== 'function') throw new Error('Expected relay activation');
    \(counterSource)
    """.write(to: requiredRelayURL, atomically: true, encoding: .utf8)
    for length in [32, 256] {
        let relayOutage = CounterRuntime(telemetry: HostTelemetry(environment: [
            "FOLDKIT_TELEMETRY_RELAY_URL": "http://127.0.0.1:1/telemetry",
            "FOLDKIT_TELEMETRY_SESSION_TOKEN": String(repeating: "x", count: length)
        ]))
        try relayOutage.start(bundleURL: requiredRelayURL).get()
        try relayOutage.dispose().get()
        try flushTelemetry(relayOutage)
    }

    var abandonedTelemetryReleased: () -> Bool = { false }
    try autoreleasepool {
        let telemetry = HostTelemetry(environment: [
            "FOLDKIT_TELEMETRY_RELAY_URL": "http://127.0.0.1:1/telemetry",
            "FOLDKIT_TELEMETRY_SESSION_TOKEN": testToken
        ])
        abandonedTelemetryReleased = { [weak telemetry] in telemetry == nil }
        var runtime: CounterRuntime? = CounterRuntime(telemetry: telemetry)
        let abandonedRuntimeReleased = { [weak runtime] in runtime == nil }
        try runtime?.start(bundleURL: bundleURL).get()
        try require(runtime?.snapshot?.count == 0, "Relay changed abandoned runtime startup")
        runtime = nil
        try require(abandonedRuntimeReleased(), "Telemetry retained an abandoned counter runtime")
    }
    try require(
        pump(until: abandonedTelemetryReleased, timeout: 2.2),
        "Abandoned runtime did not release its telemetry transport"
    )

    for missingBundle in [false, true] {
        let outputURL = directory.appendingPathComponent(missingBundle ? "bundle-failure.jsonl" : "startup-failure.jsonl")
        _ = FileManager.default.createFile(atPath: outputURL.path, contents: nil)
        let output = try FileHandle(forWritingTo: outputURL)
        defer { try? output.close() }
        let runtime = CounterRuntime(
            telemetry: HostTelemetry(environment: ["FOLDKIT_TELEMETRY_STDOUT": "1"], output: output)
        )
        let failureURL = directory.appendingPathComponent("secret-sentinel-telemetry.js")
        if !missingBundle {
            try "throw new Error('secret-sentinel-telemetry');".write(
                to: failureURL, atomically: true, encoding: .utf8
            )
        } else {
            try FileManager.default.removeItem(at: failureURL)
        }
        switch runtime.start(bundleURL: failureURL) {
        case .failure(.bundleRead) where missingBundle: break
        case .failure(.javaScript) where !missingBundle: break
        default: throw ProbeError.assertion("Startup telemetry replaced the native failure result")
        }
        try runtime.dispose().get()
        try flushTelemetry(runtime)
        let text = try String(contentsOf: outputURL, encoding: .utf8)
        try require(!text.contains("secret-sentinel-telemetry"), "Startup exception or bundle path leaked")
        var names: [String] = []
        var failures: [String] = []
        for line in text.split(separator: "\n") {
            let fields = try JSONDecoder().decode(
                [String: String].self, from: Data(line.dropFirst("FOLDKIT_TELEMETRY ".count).utf8)
            )
            names.append(fields["name"] ?? "")
            if let tag = fields["failureTag"] { failures.append(tag) }
        }
        try require(names.first == "host.start", "Startup failure was not observable before JS evaluation")
        try require(!names.contains("host.started"), "Failed startup reported success")
        try require(failures == [missingBundle ? "bundleRead" : "javaScript"], "Wrong startup failure tag")
    }
}

func run() throws {
    guard CommandLine.arguments.count == 2 else {
        throw ProbeError.assertion("Usage: HostProbe /absolute/path/to/dist/counter.js")
    }
    try verifySnapshotParser()
    try verifyRenderBoundary()
    try verifyUTF8Host()
    try verifyTelemetry()
    let runtime = CounterRuntime()
    defer {
        _ = runtime.dispose()
        try? flushTelemetry(runtime)
    }
    var snapshots: [CounterSnapshot] = []
    var logs: [String] = []
    runtime.onSnapshot = { snapshots.append($0) }
    runtime.onLog = {
        logs.append($0)
        print("[JS] \($0)")
    }
    try runtime.start(bundleURL: URL(fileURLWithPath: CommandLine.arguments[1])).get()
    try require(runtime.snapshot?.count == 0 && runtime.snapshot?.pending == 0, "Expected initial count 0, pending 0")
    try runtime.dispatch(.increment).get()
    try require(runtime.snapshot?.count == 1 && runtime.snapshot?.pending == 0, "Increment did not render count 1")
    try runtime.dispatch(.delayedIncrement).get()
    try require(
        pump(until: { snapshots.contains { $0.count == 1 && $0.pending == 1 } }, timeout: 2),
        "Delayed increment did not render pending 1"
    )
    try require(
        pump(until: { runtime.snapshot?.count == 2 && runtime.snapshot?.pending == 0 || runtime.failure != nil }, timeout: 5),
        "Timed out waiting for delayed increment"
    )
    if let failure = runtime.failure { throw failure }
    try require(runtime.snapshot?.count == 2 && runtime.snapshot?.pending == 0, "Delayed increment did not render count 2")
    let beforeMalformed = runtime.snapshot
    for json in ["not json", "{}", "{\"_tag\":\"unknown\"}"] {
        let logCount = logs.count
        try runtime.dispatch(json: json).get()
        try require(logs.count == logCount + 1 && logs.last == "Invalid counter message", "Malformed event was not rejected: \(json)")
        try require(runtime.snapshot == beforeMalformed, "Malformed event changed the snapshot")
    }
    try runtime.dispatch(.increment).get()
    try require(runtime.snapshot?.count == 3, "Runtime did not recover after rejected events")
    try runtime.dispatch(.delayedIncrement).get()
    try require(runtime.snapshot?.count == 3 && runtime.snapshot?.pending == 1, "No pending command before disposal")
    try require(runtime.scheduledTimerCount > 0, "No owned timer before disposal")
    let disposedSnapshot = runtime.snapshot
    try runtime.dispose().get()
    try require(runtime.scheduledTimerCount == 0, "Disposal did not release owned timers")
    let disposedRenderCount = snapshots.count
    switch runtime.dispatch(.increment) {
    case .failure(.disposed): break
    default: throw ProbeError.assertion("Disposed runtime accepted an event")
    }
    let restarted = CounterRuntime()
    defer {
        _ = restarted.dispose()
        try? flushTelemetry(restarted)
    }
    try restarted.start(bundleURL: URL(fileURLWithPath: CommandLine.arguments[1])).get()
    try require(restarted.snapshot?.count == 0 && restarted.snapshot?.pending == 0, "Fresh runtime did not restart at the initial snapshot")
    _ = pump(until: { false }, timeout: 3.5)
    try require(snapshots.count == disposedRenderCount, "Disposed runtime rendered again")
    try require(runtime.snapshot == disposedSnapshot, "Disposed runtime accepted a stale render")
    try require(restarted.snapshot?.count == 0 && restarted.snapshot?.pending == 0, "Stale completion changed restarted runtime")
    print("PASS: UTF-8 host, JSC counter lifecycle, strict boundaries, safe opt-in telemetry, exporter failure isolation")
}

do {
    try run()
} catch {
    FileHandle.standardError.write(Data("FAIL: \(error)\n".utf8))
    exit(1)
}
