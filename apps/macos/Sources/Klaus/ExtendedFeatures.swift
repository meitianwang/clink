import AppKit
import Foundation
import OSLog
import SwiftUI

// MARK: - Heartbeat Store

/// Tracks heartbeat events from the daemon via WebSocket push subscription.
@MainActor
@Observable
final class HeartbeatStore {
    static let shared = HeartbeatStore()

    private let logger = Logger(subsystem: "ai.klaus", category: "heartbeat")

    struct HeartbeatEvent: Sendable {
        let timestamp: Date
        let status: String
        let preview: String?
        let durationMs: Int?
        let hasMedia: Bool
    }

    private(set) var lastHeartbeat: HeartbeatEvent?
    private(set) var isReceiving = false
    private var subscriptionTask: Task<Void, Never>?

    func start() {
        guard subscriptionTask == nil else { return }
        subscriptionTask = Task {
            await DaemonConnection.shared.onPush { [weak self] event in
                guard event.type == "heartbeat" else { return }
                Task { @MainActor in
                    self?.handleHeartbeat(event.payload)
                }
            }
            isReceiving = true
            logger.info("Heartbeat subscription started")
        }
    }

    func stop() {
        subscriptionTask?.cancel()
        subscriptionTask = nil
        isReceiving = false
    }

    private func handleHeartbeat(_ payload: [String: Any]) {
        lastHeartbeat = HeartbeatEvent(
            timestamp: Date(),
            status: payload["status"] as? String ?? "unknown",
            preview: payload["preview"] as? String,
            durationMs: payload["durationMs"] as? Int,
            hasMedia: payload["hasMedia"] as? Bool ?? false
        )
    }
}

// MARK: - Usage / Cost Tracking

@MainActor
@Observable
final class UsageCostStore {
    static let shared = UsageCostStore()

    private let logger = Logger(subsystem: "ai.klaus", category: "usage")

    struct UsageData: Sendable {
        var totalTokens: Int = 0
        var inputTokens: Int = 0
        var outputTokens: Int = 0
        var estimatedCostUSD: Double = 0
        var sessionCount: Int = 0
    }

    private(set) var usage = UsageData()

    func refresh() async {
        do {
            let response = try await DaemonConnection.shared.request(method: "usage.get")
            if let result = response.result {
                usage = UsageData(
                    totalTokens: result["totalTokens"] as? Int ?? 0,
                    inputTokens: result["inputTokens"] as? Int ?? 0,
                    outputTokens: result["outputTokens"] as? Int ?? 0,
                    estimatedCostUSD: result["estimatedCostUSD"] as? Double ?? 0,
                    sessionCount: result["sessionCount"] as? Int ?? 0
                )
            }
        } catch {
            // Usage endpoint may not exist yet — silently ignore
        }
    }
}

/// Menu bar usage display.
struct CostUsageMenuView: View {
    let usage: UsageCostStore.UsageData

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Image(systemName: "chart.bar")
                    .foregroundStyle(.secondary)
                Text("Usage")
                    .font(.caption.bold())
            }
            if usage.totalTokens > 0 {
                Text("\(formatTokens(usage.totalTokens)) tokens")
                    .font(.caption)
                if usage.estimatedCostUSD > 0 {
                    Text("~$\(String(format: "%.4f", usage.estimatedCostUSD))")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            } else {
                Text("No usage data")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func formatTokens(_ count: Int) -> String {
        if count >= 1_000_000 {
            return String(format: "%.1fM", Double(count) / 1_000_000)
        } else if count >= 1_000 {
            return String(format: "%.1fK", Double(count) / 1_000)
        }
        return "\(count)"
    }
}

// MARK: - Animated Status Icon

/// Animated menu bar icon with working/idle/paused/error states.
struct AnimatedStatusIcon: View {
    let status: DaemonProcessManager.Status
    let isPaused: Bool
    let isWorking: Bool

    @State private var animationPhase: CGFloat = 0

    var body: some View {
        ZStack {
            // Base icon
            Image(systemName: baseIconName)
                .foregroundStyle(baseColor)

            // Working animation overlay
            if isWorking && !isPaused {
                Circle()
                    .trim(from: 0, to: 0.7)
                    .stroke(Color.blue, lineWidth: 1.5)
                    .frame(width: 12, height: 12)
                    .rotationEffect(.degrees(animationPhase * 360))
                    .onAppear {
                        withAnimation(.linear(duration: 1.0).repeatForever(autoreverses: false)) {
                            animationPhase = 1.0
                        }
                    }
                    .onDisappear {
                        animationPhase = 0
                    }
            }
        }
    }

    private var baseIconName: String {
        if isPaused { return "pause.circle.fill" }
        switch status {
        case .stopped: return "circle"
        case .starting: return "circle.dotted"
        case .running, .attachedExisting:
            return isWorking ? "circle.fill" : "circle.fill"
        case .failed: return "exclamationmark.circle.fill"
        }
    }

    private var baseColor: Color {
        if isPaused { return .secondary }
        switch status {
        case .stopped: return .secondary
        case .starting: return .orange
        case .running, .attachedExisting:
            return isWorking ? .blue : .green
        case .failed: return .red
        }
    }
}

// MARK: - Canvas A2UI Bridge

/// Handles A2UI (Agent-to-UI) protocol messages between the daemon and Canvas WebView.
@MainActor
final class CanvasA2UIBridge {
    static let shared = CanvasA2UIBridge()

    private let logger = Logger(subsystem: "ai.klaus", category: "canvas.a2ui")

    /// Process an A2UI action from the WebView's JavaScript bridge.
    func handleAction(command: String, payload: [String: Any], sessionKey: String) async {
        logger.info("A2UI action: \(command, privacy: .public) session=\(sessionKey, privacy: .public)")

        switch command {
        case "navigate":
            if let url = payload["url"] as? String {
                CanvasManager.shared.show(sessionKey: sessionKey, htmlPath: url)
            }

        case "eval":
            if let js = payload["javascript"] as? String {
                _ = await CanvasManager.shared.eval(sessionKey: sessionKey, javaScript: js)
            }

        case "snapshot":
            if let outPath = payload["outPath"] as? String {
                let controller = CanvasManager.shared
                // Snapshot is handled by the controller
                logger.info("Snapshot requested to \(outPath, privacy: .public)")
            }

        case "present":
            let path = payload["path"] as? String
            CanvasManager.shared.show(sessionKey: sessionKey, htmlPath: path)

        case "hide":
            CanvasManager.shared.hide(sessionKey: sessionKey)

        case "resize":
            // Resize canvas window
            if let width = payload["width"] as? CGFloat,
               let height = payload["height"] as? CGFloat {
                logger.info("Resize canvas to \(width)x\(height)")
            }

        default:
            logger.warning("Unknown A2UI command: \(command, privacy: .public)")
        }
    }

    /// Subscribe to daemon push events for canvas updates.
    func startListening() {
        Task {
            await DaemonConnection.shared.onPush { [weak self] event in
                guard event.type == "canvas" else { return }
                let payload = event.payload
                guard let command = payload["command"] as? String else { return }
                let sessionKey = payload["sessionKey"] as? String ?? "default"
                Task { @MainActor in
                    await self?.handleAction(command: command, payload: payload, sessionKey: sessionKey)
                }
            }
        }
    }
}
