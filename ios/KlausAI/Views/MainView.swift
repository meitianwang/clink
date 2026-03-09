import SwiftUI

/// Main app view with sidebar (sessions) and detail (chat).
struct MainView: View {
    @Environment(AppState.self) private var appState
    @State private var chatVM: ChatViewModel?
    @State private var sessionVM: SessionListViewModel?
    @State private var showSettings = false
    @State private var columnVisibility = NavigationSplitViewVisibility.automatic

    var body: some View {
        NavigationSplitView(columnVisibility: $columnVisibility) {
            // Sidebar: sessions
            if let sessionVM, let chatVM {
                SessionListView(sessionVM: sessionVM, chatVM: chatVM)
                    .navigationTitle(L10n.appName)
                    .toolbar {
                        ToolbarItem(placement: .topBarTrailing) {
                            Button {
                                showSettings = true
                            } label: {
                                Image(systemName: "gear")
                            }
                        }
                    }
            }
        } detail: {
            // Detail: chat with session title
            if let chatVM {
                ChatView(viewModel: chatVM)
                    .navigationTitle(chatTitle)
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        // Connection status dot in toolbar
                        ToolbarItem(placement: .topBarTrailing) {
                            Circle()
                                .fill(connectionColor)
                                .frame(width: 8, height: 8)
                        }
                    }
            } else {
                ContentUnavailableView(
                    L10n.noConversations,
                    systemImage: "bubble.left.and.bubble.right",
                    description: Text(L10n.startNewChat)
                )
            }
        }
        .sheet(isPresented: $showSettings) {
            SettingsView()
                .environment(appState)
        }
        .onAppear {
            if chatVM == nil {
                chatVM = ChatViewModel(appState: appState)
                sessionVM = SessionListViewModel(appState: appState)
            }
        }
    }

    /// Display session title from API, fallback to "Chat"
    private var chatTitle: String {
        if let title = chatVM?.currentSessionTitle, !title.isEmpty {
            return title
        }
        if let sessionId = chatVM?.currentSessionId, sessionId != "default" {
            return sessionId
        }
        return "Chat"
    }

    private var connectionColor: Color {
        switch appState.webSocket.state {
        case .connected: return .green
        case .connecting: return .yellow
        case .disconnected: return .red
        }
    }
}
