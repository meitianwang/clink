import SwiftUI

/// Sidebar view listing all chat sessions (Chinese localized).
struct SessionListView: View {
    @Bindable var sessionVM: SessionListViewModel
    @Bindable var chatVM: ChatViewModel
    @Environment(AppState.self) private var appState

    var body: some View {
        List {
            // New chat button
            Button {
                chatVM.newSession()
            } label: {
                Label(L10n.newChat, systemImage: "plus.bubble")
            }

            // Session list
            Section(L10n.conversations) {
                if sessionVM.sessions.isEmpty && !sessionVM.isLoading {
                    ContentUnavailableView(
                        L10n.noConversations,
                        systemImage: "bubble.left.and.bubble.right",
                        description: Text(L10n.startNewChat)
                    )
                }

                ForEach(sessionVM.sessions) { session in
                    SessionRow(session: session, isActive: session.sessionId == chatVM.currentSessionId)
                        .contentShape(Rectangle())
                        .onTapGesture {
                            Task {
                                await chatVM.switchSession(
                                    session.sessionId,
                                    title: session.title
                                )
                            }
                            HapticManager.selection()
                        }
                }
                .onDelete { indexSet in
                    Task {
                        for index in indexSet {
                            let session = sessionVM.sessions[index]
                            await sessionVM.deleteSession(session.sessionId)
                        }
                    }
                }
            }
        }
        .listStyle(.sidebar)
        .refreshable {
            await sessionVM.loadSessions()
        }
        .task {
            await sessionVM.loadSessions()
        }
        .overlay {
            if sessionVM.isLoading && sessionVM.sessions.isEmpty {
                ProgressView()
            }
        }
    }
}
