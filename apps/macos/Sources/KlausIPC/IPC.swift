/// Shared IPC types between the Klaus macOS app and the Node.js daemon.

import Foundation

/// Capabilities that require TCC permission on macOS.
public enum Capability: String, Codable, CaseIterable, Sendable {
    case notifications
    case accessibility
    case screenRecording
    case microphone
    case speechRecognition
    case camera
}

/// Exec approval decision from the macOS app.
public enum ExecDecision: String, Codable, Sendable {
    case allowOnce = "allow-once"
    case allowAlways = "allow-always"
    case deny
}

/// Exec approval request sent from daemon to macOS app via Unix socket.
public struct ExecApprovalRequest: Codable, Sendable {
    public let type: String // "request"
    public let token: String
    public let id: String
    public let request: ExecRequestDetail

    public struct ExecRequestDetail: Codable, Sendable {
        public let command: String
        public let cwd: String?
        public let agentId: String?
        public let sessionKey: String?
    }
}

/// Exec approval response sent from macOS app to daemon.
public struct ExecApprovalResponse: Codable, Sendable {
    public let type: String // "decision"
    public let id: String
    public let decision: ExecDecision
}

/// Daemon status as returned by `klaus status --json`.
public struct DaemonStatus: Codable, Sendable {
    public let running: Bool
    public let pid: Int?
    public let logFile: String
    public let pidFile: String
    public let configDir: String
    public let launchAgent: String?
    public let version: String
}
