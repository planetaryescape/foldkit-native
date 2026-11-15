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

func run() throws {
    guard CommandLine.arguments.count == 2 else {
        throw ProbeError.assertion("Usage: HostProbe /absolute/path/to/dist/counter.js")
    }
    try verifySnapshotParser()
    try verifyRenderBoundary()
    try verifyUTF8Host()
    let runtime = CounterRuntime()
    defer { _ = runtime.dispose() }
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
    defer { _ = restarted.dispose() }
    try restarted.start(bundleURL: URL(fileURLWithPath: CommandLine.arguments[1])).get()
    try require(restarted.snapshot?.count == 0 && restarted.snapshot?.pending == 0, "Fresh runtime did not restart at the initial snapshot")
    _ = pump(until: { false }, timeout: 3.5)
    try require(snapshots.count == disposedRenderCount, "Disposed runtime rendered again")
    try require(runtime.snapshot == disposedSnapshot, "Disposed runtime accepted a stale render")
    try require(restarted.snapshot?.count == 0 && restarted.snapshot?.pending == 0, "Stale completion changed restarted runtime")
    print("PASS: UTF-8 host, JSC initial render, increment, named async command, strict boundaries, rejection recovery, disposal, fresh restart")
}

do {
    try run()
} catch {
    FileHandle.standardError.write(Data("FAIL: \(error)\n".utf8))
    exit(1)
}
