import Foundation

/// Manages WebSocket connection to Klaus backend with auto-reconnect.
@Observable
final class WebSocketManager: @unchecked Sendable {
    enum ConnectionState: Sendable {
        case disconnected
        case connecting
        case connected
    }

    private(set) var state: ConnectionState = .disconnected

    var onServerMessage: ((ServerMessage) -> Void)?

    private var webSocketTask: URLSessionWebSocketTask?
    private var session: URLSession?
    private var baseURL: URL?
    private var reconnectAttempts = 0
    private var isIntentionalDisconnect = false
    private var pingTask: Task<Void, Never>?
    private var receiveTask: Task<Void, Never>?

    private static let maxReconnectDelay: TimeInterval = 30
    private static let initialReconnectDelay: TimeInterval = 1

    func connect(baseURL: URL) {
        self.baseURL = baseURL
        self.isIntentionalDisconnect = false
        self.reconnectAttempts = 0
        doConnect()
    }

    func disconnect() {
        isIntentionalDisconnect = true
        cleanup()
        state = .disconnected
    }

    func send(_ message: ClientMessage) {
        guard let data = message.encode(),
              let text = String(data: data, encoding: .utf8) else { return }

        webSocketTask?.send(.string(text)) { error in
            if let error {
                print("[WS] Send error: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - Private

    private func doConnect() {
        guard let baseURL else { return }
        cleanup()
        state = .connecting

        // Build WebSocket URL
        guard var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else {
            state = .disconnected
            return
        }
        components.scheme = baseURL.scheme == "https" ? "wss" : "ws"
        components.path = "/api/ws"

        guard let wsURL = components.url else {
            state = .disconnected
            return
        }

        var request = URLRequest(url: wsURL)

        // Manually attach session cookie (URLSessionWebSocketTask doesn't auto-send cookies)
        if let cookies = HTTPCookieStorage.shared.cookies(for: baseURL) {
            let cookieHeader = cookies.map { "\($0.name)=\($0.value)" }.joined(separator: "; ")
            request.setValue(cookieHeader, forHTTPHeaderField: "Cookie")
        }

        let config = URLSessionConfiguration.default
        config.httpCookieStorage = .shared
        let urlSession = URLSession(configuration: config)
        self.session = urlSession

        let task = urlSession.webSocketTask(with: request)
        self.webSocketTask = task
        task.resume()

        state = .connected
        reconnectAttempts = 0

        startReceiveLoop()
        startPingLoop()
    }

    private func startReceiveLoop() {
        receiveTask = Task { [weak self] in
            guard let self else { return }
            while !Task.isCancelled {
                guard let task = self.webSocketTask else { break }
                do {
                    let message = try await task.receive()
                    self.handleMessage(message)
                } catch {
                    if !self.isIntentionalDisconnect {
                        print("[WS] Receive error: \(error.localizedDescription)")
                        await self.scheduleReconnect()
                    }
                    break
                }
            }
        }
    }

    private func startPingLoop() {
        pingTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(25))
                guard !Task.isCancelled else { break }
                self?.webSocketTask?.sendPing { error in
                    if let error {
                        print("[WS] Ping error: \(error.localizedDescription)")
                    }
                }
            }
        }
    }

    private func handleMessage(_ message: URLSessionWebSocketTask.Message) {
        let data: Data
        switch message {
        case .string(let text):
            guard let d = text.data(using: .utf8) else { return }
            data = d
        case .data(let d):
            data = d
        @unknown default:
            return
        }

        guard let serverMessage = ServerMessage.decode(from: data) else { return }

        // Auto-reply to ping with pong
        if case .ping = serverMessage {
            send(.pong)
            return
        }

        Task { @MainActor in
            self.onServerMessage?(serverMessage)
        }
    }

    private func scheduleReconnect() async {
        guard !isIntentionalDisconnect else { return }

        await MainActor.run { self.state = .disconnected }

        reconnectAttempts += 1
        let delay = min(
            Self.initialReconnectDelay * pow(2, Double(reconnectAttempts - 1)),
            Self.maxReconnectDelay
        )
        // Add jitter
        let jitter = Double.random(in: 0...(delay * 0.3))
        let totalDelay = delay + jitter

        print("[WS] Reconnecting in \(String(format: "%.1f", totalDelay))s (attempt \(reconnectAttempts))")
        try? await Task.sleep(for: .seconds(totalDelay))

        guard !isIntentionalDisconnect, !Task.isCancelled else { return }
        await MainActor.run { self.doConnect() }
    }

    private func cleanup() {
        pingTask?.cancel()
        pingTask = nil
        receiveTask?.cancel()
        receiveTask = nil
        webSocketTask?.cancel(with: .normalClosure, reason: nil)
        webSocketTask = nil
        session?.invalidateAndCancel()
        session = nil
    }

    deinit {
        isIntentionalDisconnect = true
        cleanup()
    }
}
