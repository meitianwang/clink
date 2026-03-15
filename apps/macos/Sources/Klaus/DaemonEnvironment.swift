import Foundation
import OSLog

/// Locates the `klaus` CLI binary and checks environment prerequisites.
@MainActor
final class DaemonEnvironment {
    static let shared = DaemonEnvironment()

    private let logger = Logger(subsystem: "ai.klaus", category: "environment")

    struct Status: Sendable {
        var nodeAvailable = false
        var klausAvailable = false
        var klausBinaryPath: String?
        var nodeVersion: String?
        var klausVersion: String?
    }

    private(set) var status = Status()

    /// Search common paths for the `klaus` binary.
    func refresh() {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        let candidates = [
            "\(home)/.npm-global/bin/klaus",
            "/usr/local/bin/klaus",
            "/opt/homebrew/bin/klaus",
            "\(home)/Library/pnpm/klaus",
        ]

        // Also try PATH via `which`
        if let whichResult = shell("which klaus") {
            let trimmed = whichResult.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty && FileManager.default.fileExists(atPath: trimmed) {
                status.klausBinaryPath = trimmed
                status.klausAvailable = true
            }
        }

        if status.klausBinaryPath == nil {
            for path in candidates {
                if FileManager.default.fileExists(atPath: path) {
                    status.klausBinaryPath = path
                    status.klausAvailable = true
                    break
                }
            }
        }

        // Check node
        if let nodeV = shell("node --version") {
            status.nodeAvailable = true
            status.nodeVersion = nodeV.trimmingCharacters(in: .whitespacesAndNewlines)
        }

        // Check klaus version
        if let bin = status.klausBinaryPath, let v = shell("\(bin) --version 2>/dev/null || echo unknown") {
            status.klausVersion = v.trimmingCharacters(in: .whitespacesAndNewlines)
        }

        logger.info("Environment: node=\(self.status.nodeAvailable) klaus=\(self.status.klausAvailable) path=\(self.status.klausBinaryPath ?? "nil", privacy: .public)")
    }

    private func shell(_ command: String) -> String? {
        let process = Process()
        let pipe = Pipe()
        process.executableURL = URL(fileURLWithPath: "/bin/zsh")
        process.arguments = ["-lc", command]
        process.standardOutput = pipe
        process.standardError = FileHandle.nullDevice
        do {
            try process.run()
            process.waitUntilExit()
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            guard process.terminationStatus == 0 else { return nil }
            return String(data: data, encoding: .utf8)
        } catch {
            return nil
        }
    }
}
