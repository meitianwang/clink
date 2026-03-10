import SwiftUI

/// Settings view using native iOS grouped list style.
struct SettingsView: View {
    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss
    @State private var showLogoutConfirm = false
    @State private var showEditName = false
    @State private var editingName = ""
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            List {
                if let user = appState.currentUser {
                    // Account section — tap to edit name
                    Section {
                        Button {
                            editingName = user.displayName
                            showEditName = true
                        } label: {
                            HStack(spacing: 14) {
                                UserAvatarView(name: user.displayName, size: 48)

                                VStack(alignment: .leading, spacing: 2) {
                                    Text(user.displayName)
                                        .font(.system(.body, weight: .semibold))
                                        .foregroundStyle(.primary)
                                    Text(user.email)
                                        .font(.subheadline)
                                        .foregroundStyle(.secondary)
                                }

                                Spacer()

                                Image(systemName: "chevron.right")
                                    .font(.caption)
                                    .foregroundStyle(.tertiary)
                            }
                        }
                        .padding(.vertical, 4)
                    }

                    // Info section
                    Section {
                        HStack {
                            Label(L10n.version, systemImage: "info.circle")
                            Spacer()
                            Text("1.0.0")
                                .foregroundStyle(.secondary)
                        }
                    }

                    // Logout section
                    Section {
                        Button(role: .destructive) {
                            showLogoutConfirm = true
                        } label: {
                            Label(L10n.logOut, systemImage: "rectangle.portrait.and.arrow.right")
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle(L10n.settings)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(L10n.done) { dismiss() }
                        .font(.system(.body, weight: .medium))
                }
            }
            .confirmationDialog(L10n.logOutConfirm, isPresented: $showLogoutConfirm) {
                Button(L10n.logOut, role: .destructive) {
                    Task {
                        await appState.logout()
                        dismiss()
                    }
                }
            }
            .alert(L10n.editName, isPresented: $showEditName) {
                TextField(L10n.displayNamePlaceholder, text: $editingName)
                Button(L10n.dismiss, role: .cancel) {}
                Button(L10n.save) {
                    let name = editingName.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !name.isEmpty else { return }
                    Task {
                        do {
                            try await appState.updateDisplayName(name)
                        } catch {
                            errorMessage = error.localizedDescription
                        }
                    }
                }
            }
            .alert(L10n.dismiss, isPresented: Binding(
                get: { errorMessage != nil },
                set: { if !$0 { errorMessage = nil } }
            )) {
                Button("OK") { errorMessage = nil }
            } message: {
                if let msg = errorMessage {
                    Text(msg)
                }
            }
        }
    }
}
