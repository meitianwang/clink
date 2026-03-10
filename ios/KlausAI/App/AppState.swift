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

        // Restore session cookie from Keychain if HTTPCookieStorage was cleared
        restoreSessionCookie()

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
        saveSessionCookie()
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
        saveSessionCookie()
        connectWebSocket()
    }

    func updateDisplayName(_ name: String) async throws {
        let user = try await api.updateProfile(displayName: name)
        currentUser = user
    }

    func uploadAvatar(data: Data, contentType: String) async throws {
        let user = try await api.uploadAvatar(data: data, contentType: contentType)
        currentUser = user
    }

    func logout() async {
        try? await api.logout()
        webSocket.disconnect()
        currentUser = nil
        SessionKeychain.delete()
        // Clear cookies
        if let url = URL(string: serverURL),
           let cookies = HTTPCookieStorage.shared.cookies(for: url) {
            for cookie in cookies {
                HTTPCookieStorage.shared.deleteCookie(cookie)
            }
        }
    }

    // MARK: - Private

    private func connectWebSocket() {
        guard let url = URL(string: serverURL) else { return }
        webSocket.connect(baseURL: url)
    }

    /// Save the klaus_session cookie to Keychain for persistence across reinstalls.
    private func saveSessionCookie() {
        guard let url = URL(string: serverURL),
              let cookies = HTTPCookieStorage.shared.cookies(for: url),
              let session = cookies.first(where: { $0.name == "klaus_session" }) else { return }
        SessionKeychain.save(token: session.value)
    }

    /// Restore the session cookie from Keychain into HTTPCookieStorage.
    private func restoreSessionCookie() {
        guard let token = SessionKeychain.load(),
              let url = URL(string: serverURL) else { return }

        // Check if cookie already exists
        if let cookies = HTTPCookieStorage.shared.cookies(for: url),
           cookies.contains(where: { $0.name == "klaus_session" }) {
            return
        }

        // Recreate the cookie
        let properties: [HTTPCookiePropertyKey: Any] = [
            .name: "klaus_session",
            .value: token,
            .domain: url.host ?? "klaus-ai.site",
            .path: "/",
            .secure: true,
        ]
        if let cookie = HTTPCookie(properties: properties) {
            HTTPCookieStorage.shared.setCookie(cookie)
        }
    }
}
