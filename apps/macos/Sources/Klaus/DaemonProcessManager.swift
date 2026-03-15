import Foundation
import OSLog
import KlausIPC

/// Manages the Klaus daemon process lifecycle — start, stop, attach, health check.
@MainActor
@Observable
final class DaemonProcessManager {
    static let shared = DaemonProcessManager()

    enum Status: Sendable, Equatable {
        case stopped
        case starting
        case running(pid: Int)
        case attachedExisting(pid: Int)
        case failed(String)

        var isActive: Bool {
            switch self {
            case .running, .attachedExisting: true
            default: false
            }
        }

        var displayText: String {
            switch self {
            case .stopped: "Stopped"
            case .starting: "Starting…"
            case .running(let pid): "Running (PID \(pid))"
            case .attachedExisting(let pid): "Attached (PID \(pid))"
            case .failed(let reason): "Failed: \(reason)"
            }
        }
    }

    private let logger = Logger(subsystem: "ai.klaus", category: "daemon")
    private(set) var status: Status = .stopped

    // MARK: - Public

    /// Start or attach to the daemon.
    func setActive(_ active: Bool) {
        if active {
            start()
        } else {
            stop()
        }
    }

    func start() {
        guard !status.isActive else { return }
        status = .starting

        // Try to attach to an existing daemon first
        if let pid = readPid(), isProcessRunning(pid) {
            logger.info("Attached to existing daemon (PID \(pid))")
            status = .attachedExisting(pid: pid)
            return
        }

        // Spawn via `klaus start`
        guard let bin = DaemonEnvironment.shared.status.klausBinaryPath else {
            status = .failed("klaus CLI not found")
            return
        }

        let process = Process()
        process.executableURL = URL(fileURLWithPath: bin)
        process.arguments = ["start"]
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice

        do {
            try process.run()
            process.waitUntilExit()
        } catch {
            status = .failed(error.localizedDescription)
            return
        }

        // Wait briefly for PID file to appear
        Task {
            try? await Task.sleep(for: .milliseconds(500))
            await MainActor.run {
                if let pid = self.readPid(), self.isProcessRunning(pid) {
                    self.status = .running(pid: pid)
                    self.logger.info("Daemon started (PID \(pid))")
                } else {
                    self.status = .failed("Daemon did not start")
                }
            }
        }
    }

    func stop() {
        guard let bin = DaemonEnvironment.shared.status.klausBinaryPath else {
            status = .stopped
            return
        }

        let process = Process()
        process.executableURL = URL(fileURLWithPath: bin)
        process.arguments = ["stop"]
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice

        do {
            try process.run()
            process.waitUntilExit()
        } catch {
            logger.error("Failed to stop daemon: \(error.localizedDescription)")
        }

        status = .stopped
    }

    /// Refresh status by checking PID file.
    func refreshStatus() {
        if let pid = readPid(), isProcessRunning(pid) {
            if !status.isActive {
                status = .attachedExisting(pid: pid)
            }
        } else {
            if status.isActive {
                status = .stopped
            }
        }
    }

    /// Get machine-readable status from the daemon.
    func fetchDaemonStatus() async -> DaemonStatus? {
        guard let bin = DaemonEnvironment.shared.status.klausBinaryPath else { return nil }

        let process = Process()
        let pipe = Pipe()
        process.executableURL = URL(fileURLWithPath: bin)
        process.arguments = ["status", "--json"]
        process.standardOutput = pipe
        process.standardError = FileHandle.nullDevice

        do {
            try process.run()
            process.waitUntilExit()
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            guard process.terminationStatus == 0 else { return nil }
            return try JSONDecoder().decode(DaemonStatus.self, from: data)
        } catch {
            logger.error("Failed to fetch daemon status: \(error.localizedDescription)")
            return nil
        }
    }

    // MARK: - Private

    private func readPid() -> Int? {
        let path = KlausPaths.pidFile
        guard FileManager.default.fileExists(atPath: path),
              let content = try? String(contentsOfFile: path, encoding: .utf8) else {
            return nil
        }
        return Int(content.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    private func isProcessRunning(_ pid: Int) -> Bool {
        kill(Int32(pid), 0) == 0
    }
}
