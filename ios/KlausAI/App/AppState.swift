import Foundation
import SwiftUI

/// Root application state managing auth, API client, and WebSocket connection.
@Observable
final class AppState {
    private(set) var currentUser: User?
    private(set) var isCheckingAuth = true
    var serverURL: String {
        didSet {
            UserDefaults.standard.set(serverURL, forKey: "klaus_server_url")
            rebuildClient()
        }
    }

    private(set) var api: APIClient
    let webSocket = WebSocketManager()

    var isAuthenticated: Bool { currentUser != nil }

    init() {
        let saved = UserDefaults.standard.string(forKey: "klaus_server_url") ?? "http://localhost:3000"
        self.serverURL = saved
        let url = URL(string: saved) ?? URL(string: "http://localhost:3000")!
        self.api = APIClient(baseURL: url)
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

    private func rebuildClient() {
        guard let url = URL(string: serverURL) else { return }
        api = APIClient(baseURL: url)
        webSocket.disconnect()
    }
}
