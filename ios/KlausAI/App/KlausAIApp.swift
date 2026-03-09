import SwiftUI

@main
struct KlausAIApp: App {
    @State private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            Group {
                if appState.isCheckingAuth {
                    ProgressView("Connecting...")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if appState.isAuthenticated {
                    MainView()
                        .environment(appState)
                } else {
                    AuthView()
                        .environment(appState)
                }
            }
            .task {
                await appState.checkSession()
            }
        }
    }
}
