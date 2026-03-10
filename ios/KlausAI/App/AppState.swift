import Foundation
import SwiftUI
import Combine

/// Root application state managing auth, API client, and WebSocket connection.
final class AppState: ObservableObject {
    @Published private(set) var currentUser: User?
    @Published private(set) var isCheckingAuth = true

    let serverURL = "https://klaus-ai.site"
    let api: APIClient
    let webSocket = WebSocketManager()

    private var wsCancellable: AnyCancellable?

    var isAuthenticated: Bool { currentUser != nil }

    init() {
        let url = URL(string: "https://klaus-ai.site")!
        self.api = APIClient(baseURL: url)

        // Forward WebSocket objectWillChange to AppState
        wsCancellable = webSocket.objectWillChange.sink { [weak self] _ in
            self?.objectWillChange.send()
        }
    }

    /// Check existing session on app launch.
    func checkSession() async {
        isCheckingAuth = true
        defer { isCheckingAuth = false }

        do {
            let user = try await api.fetchMe()
            currentUser = user
            connectWebSocket()
        } catch {
            currentUser = nil
        }
    }

    func login(email: String, password: String) async throws {
        let user = try await api.login(email: email, password: password)
        currentUser = user
        connectWebSocket()
    }

    func register(
        email: String,
        password: String,
        displayName: String,
        inviteCode: String
    ) async throws {
        let user = try await api.register(
            email: email,
            password: password,
            displayName: displayName,
            inviteCode: inviteCode
        )
        currentUser = user
        connectWebSocket()
    }

    func updateDisplayName(_ name: String) async throws {
        let user = try await api.updateProfile(displayName: name)
        currentUser = user
    }

    func logout() async {
        try? await api.logout()
        webSocket.disconnect()
        currentUser = nil
        // Clear cookies
        if let url = URL(string: serverURL),
           let cookies = HTTPCookieStorage.shared.cookies(for: url) {
            for cookie in cookies {
                HTTPCookieStorage.shared.deleteCookie(cookie)
            }
        }
    }

    private func connectWebSocket() {
        guard let url = URL(string: serverURL) else { return }
        webSocket.connect(baseURL: url)
    }
}
