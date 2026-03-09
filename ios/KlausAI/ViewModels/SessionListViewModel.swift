import Foundation

/// ViewModel for session list (sidebar).
@Observable
final class SessionListViewModel {
    var sessions: [SessionSummary] = []
    var isLoading = false
    var errorMessage: String?

    private let appState: AppState

    init(appState: AppState) {
        self.appState = appState
    }

    func loadSessions() async {
        isLoading = true
        errorMessage = nil
        do {
            let response = try await appState.api.listSessions()
            sessions = response.sessions.sorted { $0.updatedAt > $1.updatedAt }
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func deleteSession(_ sessionId: String) async {
        do {
            try await appState.api.deleteSession(sessionId: sessionId)
            sessions.removeAll { $0.sessionId == sessionId }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
