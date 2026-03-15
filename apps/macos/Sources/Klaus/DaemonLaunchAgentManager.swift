import Foundation
import OSLog

/// Manages the launchd plist for auto-starting Klaus on login.
@MainActor
final class DaemonLaunchAgentManager {
    static let shared = DaemonLaunchAgentManager()

    private let logger = Logger(subsystem: "ai.klaus", category: "launchagent")

    var isInstalled: Bool {
        FileManager.default.fileExists(atPath: KlausPaths.launchAgentPlist)
    }

    /// Install the launchd agent via `klaus daemon install`.
    func install(port: Int = defaultDaemonPort) async -> Bool {
        guard let bin = DaemonEnvironment.shared.status.klausBinaryPath else {
            logger.error("Cannot install launch agent: klaus CLI not found")
            return false
        }

        let process = Process()
        process.executableURL = URL(fileURLWithPath: bin)
        process.arguments = ["daemon", "install", "--port=\(port)"]
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice

        do {
            try process.run()
            process.waitUntilExit()
            let ok = process.terminationStatus == 0
            if ok {
                logger.info("Launch agent installed (port \(port))")
            } else {
                logger.error("Launch agent install failed (exit \(process.terminationStatus))")
            }
            return ok
        } catch {
            logger.error("Launch agent install error: \(error.localizedDescription)")
            return false
        }
    }

    /// Uninstall the launchd agent via `klaus daemon uninstall`.
    func uninstall() async -> Bool {
        guard let bin = DaemonEnvironment.shared.status.klausBinaryPath else {
            logger.error("Cannot uninstall launch agent: klaus CLI not found")
            return false
        }

        let process = Process()
        process.executableURL = URL(fileURLWithPath: bin)
        process.arguments = ["daemon", "uninstall"]
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice

        do {
            try process.run()
            process.waitUntilExit()
            let ok = process.terminationStatus == 0
            if ok {
                logger.info("Launch agent uninstalled")
            }
            return ok
        } catch {
            logger.error("Launch agent uninstall error: \(error.localizedDescription)")
            return false
        }
    }
}
