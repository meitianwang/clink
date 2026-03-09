import SwiftUI

/// Main app view with sidebar (sessions) and detail (chat).
struct MainView: View {
    @EnvironmentObject private var appState: AppState
    @State private var chatVM: ChatViewModel?
    @State private var sessionVM: SessionListViewModel?
    @State private var showSettings = false
    @State private var selectedSessionId: String? = "default"
    @State private var columnVisibility = NavigationSplitViewVisibility.automatic

    var body: some View {
        NavigationSplitView(columnVisibility: $columnVisibility) {
            // Sidebar: sessions
            if let sessionVM, let chatVM {
                SessionListView(
                    sessionVM: sessionVM,
                    chatVM: chatVM,
                    selectedSessionId: $selectedSessionId
                )
                .toolbar {
                    ToolbarItem(placement: .navigationBarLeading) {
                        HStack(spacing: 8) {
                            Image("KlausLogo")
                                .resizable()
                                .aspectRatio(contentMode: .fit)
                                .frame(width: 28, height: 28)
                                .clipShape(RoundedRectangle(cornerRadius: 6))
                            Text(L10n.appName)
                                .font(.headline)
                        }
                    }
                    ToolbarItem(placement: .navigationBarTrailing) {
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
                        ToolbarItem(placement: .navigationBarTrailing) {
                            Circle()
                                .fill(connectionColor)
                                .frame(width: 8, height: 8)
                        }
                    }
            } else {
                EmptyStateView(
                    title: L10n.noConversations,
                    systemImage: "bubble.left.and.bubble.right",
                    description: L10n.startNewChat
                )
            }
        }
        .sheet(isPresented: $showSettings) {
            SettingsView()
                .environmentObject(appState)
        }
        .onAppear {
            if chatVM == nil {
                chatVM = ChatViewModel(appState: appState)
                sessionVM = SessionListViewModel(appState: appState)
            }
        }
    }

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

/// Replacement for ContentUnavailableView (iOS 17+)
struct EmptyStateView: View {
    let title: String
    let systemImage: String
    let description: String

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: systemImage)
                .font(.system(size: 40))
                .foregroundStyle(.secondary)
            Text(title)
                .font(.headline)
            Text(description)
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
