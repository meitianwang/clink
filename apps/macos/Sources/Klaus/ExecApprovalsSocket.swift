import AppKit
import CryptoKit
import Foundation
import OSLog

/// Unix socket server for exec command approvals.
/// The Klaus daemon connects here to request approval before running shell commands.
@MainActor
final class ExecApprovalsSocket {
    static let shared = ExecApprovalsSocket()

    private let logger = Logger(subsystem: "ai.klaus", category: "exec.socket")
    private var serverFd: Int32 = -1
    private var isRunning = false
    private var token: String = ""
    private var acceptTask: Task<Void, Never>?

    // Allowlist: patterns that are always allowed
    var allowlist: [ExecAllowlistEntry] = []

    struct ExecAllowlistEntry: Codable {
        let id: String
        var pattern: String
        var lastUsedAt: Double?
        var lastUsedCommand: String?
    }

    // MARK: - Lifecycle

    func start() {
        guard !isRunning else { return }

        // Generate token
        let tokenData = Data((0..<24).map { _ in UInt8.random(in: 0...255) })
        token = tokenData.base64EncodedString()

        // Write token file
        let tokenPath = KlausPaths.execTokenFile
        let configDir = KlausPaths.configDir
        try? FileManager.default.createDirectory(atPath: configDir, withIntermediateDirectories: true)
        FileManager.default.createFile(atPath: tokenPath, contents: Data(token.utf8))
        chmod(tokenPath, 0o600)

        // Remove existing socket
        let socketPath = KlausPaths.execSocket
        unlink(socketPath)

        // Create Unix domain socket
        serverFd = socket(AF_UNIX, SOCK_STREAM, 0)
        guard serverFd >= 0 else {
            logger.error("Failed to create socket: \(errno)")
            return
        }

        var addr = sockaddr_un()
        addr.sun_family = sa_family_t(AF_UNIX)
        let pathBytes = socketPath.utf8CString
        guard pathBytes.count <= MemoryLayout.size(ofValue: addr.sun_path) else {
            logger.error("Socket path too long")
            Darwin.close(serverFd)
            serverFd = -1
            return
        }
        withUnsafeMutablePointer(to: &addr.sun_path) { ptr in
            ptr.withMemoryRebound(to: CChar.self, capacity: pathBytes.count) { dest in
                for (i, byte) in pathBytes.enumerated() {
                    dest[i] = byte
                }
            }
        }

        let bindResult = withUnsafePointer(to: &addr) { ptr in
            ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockPtr in
                bind(serverFd, sockPtr, socklen_t(MemoryLayout<sockaddr_un>.size))
            }
        }
        guard bindResult == 0 else {
            logger.error("Failed to bind socket: \(errno)")
            Darwin.close(serverFd)
            serverFd = -1
            return
        }

        chmod(socketPath, 0o600)

        guard listen(serverFd, 16) == 0 else {
            logger.error("Failed to listen: \(errno)")
            Darwin.close(serverFd)
            serverFd = -1
            return
        }

        isRunning = true
        logger.info("Exec approvals socket listening at \(socketPath, privacy: .public)")

        // Accept loop
        acceptTask = Task.detached { [weak self] in
            guard let self else { return }
            while !Task.isCancelled {
                let clientFd = accept(await self.serverFd, nil, nil)
                guard clientFd >= 0 else {
                    if !Task.isCancelled {
                        // Brief pause before retrying
                        try? await Task.sleep(for: .milliseconds(100))
                    }
                    continue
                }

                // Verify peer UID
                var uid: uid_t = 0
                var gid: gid_t = 0
                guard getpeereid(clientFd, &uid, &gid) == 0, uid == getuid() else {
                    Darwin.close(clientFd)
                    continue
                }

                Task.detached {
                    await self.handleClient(fd: clientFd)
                }
            }
        }
    }

    func stop() {
        acceptTask?.cancel()
        acceptTask = nil
        if serverFd >= 0 {
            Darwin.close(serverFd)
            serverFd = -1
        }
        unlink(KlausPaths.execSocket)
        isRunning = false
        logger.info("Exec approvals socket stopped")
    }

    // MARK: - Client Handler

    private func handleClient(fd: Int32) async {
        let handle = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
        guard let data = try? handle.availableData, !data.isEmpty else { return }

        guard let line = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .newlines),
              let json = try? JSONSerialization.jsonObject(with: Data(line.utf8)) as? [String: Any],
              let type = json["type"] as? String else {
            return
        }

        switch type {
        case "request":
            await handleApprovalRequest(json: json, handle: handle)
        case "exec":
            await handleExecRequest(json: json, handle: handle)
        default:
            break
        }
    }

    private func handleApprovalRequest(json: [String: Any], handle: FileHandle) async {
        guard let reqToken = json["token"] as? String,
              reqToken == token,
              let id = json["id"] as? String,
              let request = json["request"] as? [String: Any],
              let command = request["command"] as? String else {
            return
        }

        let cwd = request["cwd"] as? String ?? ""
        let agentId = request["agentId"] as? String ?? "main"

        // Check allowlist first
        if matchesAllowlist(command: command) {
            let response = "{\"type\":\"decision\",\"id\":\"\(id)\",\"decision\":\"allow-once\"}\n"
            handle.write(Data(response.utf8))
            return
        }

        // Show NSAlert on main thread
        let decision = await MainActor.run { () -> String in
            let alert = NSAlert()
            alert.messageText = "Command Approval"
            alert.informativeText = "Agent \"\(agentId)\" wants to run:\n\n\(command)\n\nIn: \(cwd)"
            alert.alertStyle = .warning
            alert.addButton(withTitle: "Allow Once")
            alert.addButton(withTitle: "Always Allow")
            alert.addButton(withTitle: "Deny")

            let response = alert.runModal()
            switch response {
            case .alertFirstButtonReturn: return "allow-once"
            case .alertSecondButtonReturn: return "allow-always"
            default: return "deny"
            }
        }

        // If always allow, add to allowlist
        if decision == "allow-always" {
            let entry = ExecAllowlistEntry(
                id: UUID().uuidString,
                pattern: command,
                lastUsedAt: Date().timeIntervalSince1970 * 1000,
                lastUsedCommand: command
            )
            allowlist.append(entry)
        }

        let response = "{\"type\":\"decision\",\"id\":\"\(id)\",\"decision\":\"\(decision)\"}\n"
        handle.write(Data(response.utf8))
    }

    private func handleExecRequest(json: [String: Any], handle: FileHandle) async {
        guard let id = json["id"] as? String,
              let nonce = json["nonce"] as? String,
              let ts = json["ts"] as? Int,
              let hmac = json["hmac"] as? String,
              let requestJson = json["requestJson"] as? String else {
            return
        }

        // Verify HMAC
        let expectedHmac = computeHmac(nonce: nonce, ts: ts, requestJson: requestJson)
        guard hmac == expectedHmac else {
            let err = "{\"type\":\"exec-res\",\"id\":\"\(id)\",\"ok\":false,\"error\":\"HMAC mismatch\"}\n"
            handle.write(Data(err.utf8))
            return
        }

        // Verify TTL (10 seconds)
        let nowMs = Int(Date().timeIntervalSince1970 * 1000)
        guard abs(nowMs - ts) <= 10_000 else {
            let err = "{\"type\":\"exec-res\",\"id\":\"\(id)\",\"ok\":false,\"error\":\"Request expired\"}\n"
            handle.write(Data(err.utf8))
            return
        }

        // Parse request
        guard let reqData = requestJson.data(using: .utf8),
              let req = try? JSONSerialization.jsonObject(with: reqData) as? [String: Any],
              let commandArray = req["command"] as? [String],
              !commandArray.isEmpty else {
            let err = "{\"type\":\"exec-res\",\"id\":\"\(id)\",\"ok\":false,\"error\":\"Invalid command\"}\n"
            handle.write(Data(err.utf8))
            return
        }

        let cwd = req["cwd"] as? String
        let env = req["env"] as? [String: String] ?? [:]
        let timeoutMs = req["timeoutMs"] as? Int ?? 30_000

        // Execute command
        let result = await ShellExecutor.run(
            command: commandArray,
            cwd: cwd,
            env: env,
            timeoutMs: timeoutMs
        )

        let payload: [String: Any] = [
            "exitCode": result.exitCode,
            "timedOut": result.timedOut,
            "success": result.exitCode == 0 && !result.timedOut,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "error": result.error as Any,
        ]

        let responseDict: [String: Any] = [
            "type": "exec-res",
            "id": id,
            "ok": true,
            "payload": payload,
        ]

        if let responseData = try? JSONSerialization.data(withJSONObject: responseDict),
           var responseStr = String(data: responseData, encoding: .utf8) {
            responseStr += "\n"
            handle.write(Data(responseStr.utf8))
        }
    }

    // MARK: - Helpers

    private func matchesAllowlist(command: String) -> Bool {
        for entry in allowlist {
            // Exact match only — no prefix matching to prevent injection
            if command == entry.pattern {
                return true
            }
        }
        return false
    }

    private func computeHmac(nonce: String, ts: Int, requestJson: String) -> String {
        let key = SymmetricKey(data: Data(token.utf8))
        let message = "\(nonce):\(ts):\(requestJson)"
        let mac = HMAC<SHA256>.authenticationCode(for: Data(message.utf8), using: key)
        return mac.map { String(format: "%02x", $0) }.joined()
    }
}

// MARK: - Shell Executor

enum ShellExecutor {
    struct Result {
        let exitCode: Int
        let timedOut: Bool
        let stdout: String
        let stderr: String
        let error: String?
    }

    static func run(
        command: [String],
        cwd: String?,
        env: [String: String],
        timeoutMs: Int
    ) async -> Result {
        let process = Process()
        let stdoutPipe = Pipe()
        let stderrPipe = Pipe()

        process.executableURL = URL(fileURLWithPath: command[0])
        if command.count > 1 {
            process.arguments = Array(command.dropFirst())
        }
        if let cwd {
            process.currentDirectoryURL = URL(fileURLWithPath: cwd)
        }

        // Merge environment
        var processEnv = ProcessInfo.processInfo.environment
        for (k, v) in env {
            processEnv[k] = v
        }
        // Filter dangerous env vars
        let blocked = ["DYLD_INSERT_LIBRARIES", "DYLD_LIBRARY_PATH", "LD_PRELOAD", "NODE_OPTIONS"]
        for key in blocked {
            processEnv.removeValue(forKey: key)
        }
        process.environment = processEnv

        process.standardOutput = stdoutPipe
        process.standardError = stderrPipe

        do {
            try process.run()
        } catch {
            return Result(exitCode: -1, timedOut: false, stdout: "", stderr: "", error: error.localizedDescription)
        }

        // Timeout watchdog
        let timedOut = await withTaskGroup(of: Bool.self) { group in
            group.addTask {
                process.waitUntilExit()
                return false
            }
            group.addTask {
                try? await Task.sleep(for: .milliseconds(timeoutMs))
                if process.isRunning {
                    process.terminate()
                    return true
                }
                return false
            }
            var result = false
            for await value in group {
                if value { result = true }
            }
            return result
        }

        let stdoutData = stdoutPipe.fileHandleForReading.readDataToEndOfFile()
        let stderrData = stderrPipe.fileHandleForReading.readDataToEndOfFile()

        return Result(
            exitCode: Int(process.terminationStatus),
            timedOut: timedOut,
            stdout: String(data: stdoutData, encoding: .utf8) ?? "",
            stderr: String(data: stderrData, encoding: .utf8) ?? "",
            error: nil
        )
    }
}
