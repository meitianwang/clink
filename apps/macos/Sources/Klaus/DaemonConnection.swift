import Foundation
import OSLog

/// Actor-based WebSocket connection to the Klaus daemon.
/// Provides JSON-RPC request/response and push event subscription.
actor DaemonConnection {
    static let shared = DaemonConnection()

    private let logger = Logger(subsystem: "ai.klaus", category: "connection")
    private var webSocket: URLSessionWebSocketTask?
    private var session: URLSession?
    private var pendingRequests: [String: CheckedContinuation<RpcResponse, Error>] = [:]
    private var pushHandlers: [(DaemonPushEvent) -> Void] = []
    private var isConnected = false
    private var reconnectTask: Task<Void, Never>?
    private var rpcCounter = 0

    // MARK: - Connection

    func connect() {
        guard webSocket == nil else { return }

        guard let token = readLocalToken() else {
            logger.warning("No local token found at \(KlausPaths.localTokenFile)")
            return
        }

        var urlComponents = URLComponents()
        urlComponents.scheme = "ws"
        urlComponents.host = "localhost"
        urlComponents.port = defaultDaemonPort
        urlComponents.path = "/api/ws"

        guard let url = urlComponents.url else {
            logger.error("Failed to construct WebSocket URL")
            return
        }

        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 10
        config.httpAdditionalHeaders = ["X-Klaus-Local-Token": token]
        session = URLSession(configuration: config)
        let task = session!.webSocketTask(with: url)
        webSocket = task
        task.resume()
        isConnected = true
        logger.info("WebSocket connecting to \(url.absoluteString, privacy: .public)")

        startReceiveLoop()
    }

    func disconnect() {
        reconnectTask?.cancel()
        reconnectTask = nil
        webSocket?.cancel(with: .goingAway, reason: nil)
        webSocket = nil
        isConnected = false

        // Fail all pending requests
        for (_, continuation) in pendingRequests {
            continuation.resume(throwing: ConnectionError.disconnected)
        }
        pendingRequests.removeAll()
    }

    // MARK: - RPC

    /// Send a JSON-RPC request and wait for the response.
    func request(method: String, params: [String: Any] = [:], timeoutMs: Int = 10_000) async throws -> RpcResponse {
        guard let ws = webSocket else {
            throw ConnectionError.notConnected
        }

        rpcCounter += 1
        let id = "rpc-\(rpcCounter)"

        var payload: [String: Any] = [
            "type": "rpc",
            "id": id,
            "method": method,
        ]
        if !params.isEmpty {
            payload["params"] = params
        }

        let data = try JSONSerialization.data(withJSONObject: payload)
        let message = URLSessionWebSocketTask.Message.data(data)

        try await ws.send(message)

        return try await withCheckedThrowingContinuation { continuation in
            pendingRequests[id] = continuation

            // Timeout
            Task {
                try? await Task.sleep(for: .milliseconds(timeoutMs))
                if let pending = pendingRequests.removeValue(forKey: id) {
                    pending.resume(throwing: ConnectionError.timeout)
                }
            }
        }
    }

    /// Convenience: request with typed Decodable result.
    func requestDecoded<T: Decodable>(_ type: T.Type, method: String, params: [String: Any] = [:]) async throws -> T {
        let response = try await request(method: method, params: params)
        guard let result = response.result else {
            throw ConnectionError.emptyResult
        }
        let data = try JSONSerialization.data(withJSONObject: result)
        return try JSONDecoder().decode(T.self, from: data)
    }

    // MARK: - Push Events

    func onPush(_ handler: @escaping @Sendable (DaemonPushEvent) -> Void) {
        pushHandlers.append(handler)
    }

    // MARK: - Health

    func health() async throws -> HealthResponse {
        return try await requestDecoded(HealthResponse.self, method: "health")
    }

    // MARK: - Private

    private func startReceiveLoop() {
        Task { [weak self] in
            guard let self else { return }
            while await self.isConnected {
                do {
                    guard let ws = await self.webSocket else { break }
                    let message = try await ws.receive()
                    await self.handleMessage(message)
                } catch {
                    await self.handleDisconnect(error: error)
                    break
                }
            }
        }
    }

    private func handleMessage(_ message: URLSessionWebSocketTask.Message) {
        let data: Data
        switch message {
        case .data(let d):
            data = d
        case .string(let s):
            data = Data(s.utf8)
        @unknown default:
            return
        }

        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = json["type"] as? String else {
            return
        }

        switch type {
        case "rpc-response":
            guard let id = json["id"] as? String else { return }
            let response = RpcResponse(
                id: id,
                result: json["result"] as? [String: Any],
                error: json["error"] as? String
            )
            if let continuation = pendingRequests.removeValue(forKey: id) {
                if let error = response.error {
                    continuation.resume(throwing: ConnectionError.rpcError(error))
                } else {
                    continuation.resume(returning: response)
                }
            }

        case "message", "stream", "tool", "permission", "error", "file", "merged", "config_updated":
            let event = DaemonPushEvent(type: type, payload: json)
            for handler in pushHandlers {
                handler(event)
            }

        case "ping":
            // Respond with pong
            let pong = try? JSONSerialization.data(withJSONObject: ["type": "pong"])
            if let pong {
                Task { try? await webSocket?.send(.data(pong)) }
            }

        default:
            logger.debug("Unknown WS message type: \(type)")
        }
    }

    private func handleDisconnect(error: Error) {
        logger.warning("WebSocket disconnected: \(error.localizedDescription)")
        isConnected = false
        webSocket = nil

        // Fail pending requests
        for (_, continuation) in pendingRequests {
            continuation.resume(throwing: ConnectionError.disconnected)
        }
        pendingRequests.removeAll()

        // Schedule reconnect
        reconnectTask = Task {
            try? await Task.sleep(for: .seconds(3))
            guard !Task.isCancelled else { return }
            connect()
        }
    }

    private func readLocalToken() -> String? {
        let path = KlausPaths.localTokenFile
        guard FileManager.default.fileExists(atPath: path),
              let content = try? String(contentsOfFile: path, encoding: .utf8) else {
            return nil
        }
        return content.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

// MARK: - Types

struct RpcResponse: @unchecked Sendable {
    let id: String
    let result: [String: Any]?
    let error: String?
}

struct DaemonPushEvent: @unchecked Sendable {
    let type: String
    let payload: [String: Any]
}

struct HealthResponse: Codable, Sendable {
    let ok: Bool
    let uptime: Double
    let timestamp: Int
}

enum ConnectionError: LocalizedError {
    case notConnected
    case disconnected
    case timeout
    case emptyResult
    case rpcError(String)

    var errorDescription: String? {
        switch self {
        case .notConnected: "Not connected to daemon"
        case .disconnected: "Connection lost"
        case .timeout: "Request timed out"
        case .emptyResult: "Empty result"
        case .rpcError(let msg): "RPC error: \(msg)"
        }
    }
}
