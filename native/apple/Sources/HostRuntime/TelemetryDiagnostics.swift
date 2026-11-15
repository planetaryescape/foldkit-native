import Foundation
import OSLog

final class TelemetryDiagnostics {
    enum Kind: Hashable {
        case queueFull
        case stdoutFailure
        case relayFailure
    }

    private let lock = NSLock()
    private var reported: Set<Kind> = []
    private let logger = Logger(subsystem: "org.planetaryescape.foldkitnative", category: "telemetry")

    func report(_ kind: Kind) {
        lock.lock()
        let first = reported.insert(kind).inserted
        lock.unlock()
        guard first else { return }
        switch kind {
        case .queueFull:
            logger.error("Foldkit telemetry queue full; records dropped")
        case .stdoutFailure:
            logger.error("Foldkit telemetry stdout unavailable; records dropped")
        case .relayFailure:
            logger.error("Foldkit telemetry relay unavailable; records dropped")
        }
    }
}
