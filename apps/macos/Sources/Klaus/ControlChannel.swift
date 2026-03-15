import Foundation
import Observation
import OSLog

/// Observable control channel that tracks connection health and state.
@MainActor
@Observable
final class ControlChannel {
    static let shared = ControlChannel()

    enum State: Equatable, Sendable {
        case disconnected
        case connecting
        case connected
        case degraded(String)
    }

    private let logger = Logger(subsystem: "ai.klaus", category: "control")
    private(set) var state: State = .disconnected
    private var healthTimer: Timer?
    private var lastHealthCheck: Date?

    func start() {
        guard healthTimer == nil else { return }
        state = .connecting

        Task {
            await DaemonConnection.shared.connect()
            await DaemonConnection.shared.onPush { [weak self] event in
                Task { @MainActor in
                    self?.handlePush(event)
                }
            }
        }

        // Periodic health check every 10 seconds
        healthTimer = Timer.scheduledTimer(withTimeInterval: 10, repeats: true) { [weak self] _ in
            Task { @MainActor in
                await self?.checkHealth()
            }
        }

        // Initial health check
        Task { await checkHealth() }
    }

    func stop() {
        healthTimer?.invalidate()
        healthTimer = nil
        Task { await DaemonConnection.shared.disconnect() }
        state = .disconnected
    }

    private func checkHealth() async {
        do {
            let health = try await DaemonConnection.shared.health()
            if health.ok {
                state = .connected
                lastHealthCheck = Date()
            } else {
                state = .degraded("unhealthy")
            }
        } catch {
            if state == .connected {
                state = .degraded(error.localizedDescription)
            } else {
                state = .disconnected
            }
        }
    }

    private func handlePush(_ event: DaemonPushEvent) {
        // Update working state, handle notifications, etc.
        switch event.type {
        case "config_updated":
            logger.info("Config updated notification received")
        default:
            break
        }
    }
}
