import SwiftUI

/// Root auth view that switches between login and register.
struct AuthView: View {
    @Environment(AppState.self) private var appState
    @State private var viewModel = AuthViewModel()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 32) {
                    // Logo
                    VStack(spacing: 8) {
                        Image(systemName: "bubble.left.and.bubble.right.fill")
                            .font(.system(size: 48))
                            .foregroundStyle(.primary)
                        Text(L10n.appName)
                            .font(.largeTitle.bold())
                    }
                    .padding(.top, 60)

                    // Server URL
                    VStack(alignment: .leading, spacing: 6) {
                        Text(L10n.serverLabel)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        @Bindable var state = appState
                        TextField("http://localhost:3000", text: $state.serverURL)
                            .textFieldStyle(.roundedBorder)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .keyboardType(.URL)
                    }

                    // Form
                    if viewModel.isRegisterMode {
                        RegisterFormView(viewModel: viewModel, appState: appState)
                    } else {
                        LoginFormView(viewModel: viewModel, appState: appState)
                    }

                    // Error
                    if let error = viewModel.errorMessage {
                        Text(error)
                            .font(.callout)
                            .foregroundStyle(.red)
                            .multilineTextAlignment(.center)
                    }

                    // Toggle mode
                    Button {
                        viewModel.isRegisterMode.toggle()
                        viewModel.errorMessage = nil
                    } label: {
                        Text(viewModel.isRegisterMode ? L10n.switchToLogin : L10n.switchToRegister)
                            .font(.callout)
                    }
                }
                .padding(.horizontal, 24)
            }
            .navigationBarHidden(true)
        }
    }
}

private struct LoginFormView: View {
    @Bindable var viewModel: AuthViewModel
    let appState: AppState

    var body: some View {
        VStack(spacing: 16) {
            TextField(L10n.emailPlaceholder, text: $viewModel.email)
                .textFieldStyle(.roundedBorder)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.emailAddress)

            SecureField(L10n.passwordPlaceholder, text: $viewModel.password)
                .textFieldStyle(.roundedBorder)

            Button {
                Task { await viewModel.login(with: appState) }
            } label: {
                Group {
                    if viewModel.isLoading {
                        ProgressView()
                    } else {
                        Text(L10n.loginButton)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
            }
            .buttonStyle(.borderedProminent)
            .disabled(!viewModel.isLoginValid || viewModel.isLoading)
        }
    }
}

private struct RegisterFormView: View {
    @Bindable var viewModel: AuthViewModel
    let appState: AppState

    var body: some View {
        VStack(spacing: 16) {
            TextField(L10n.displayNamePlaceholder, text: $viewModel.displayName)
                .textFieldStyle(.roundedBorder)
                .textContentType(.name)

            TextField(L10n.emailPlaceholder, text: $viewModel.email)
                .textFieldStyle(.roundedBorder)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.emailAddress)

            SecureField(L10n.passwordHint, text: $viewModel.password)
                .textFieldStyle(.roundedBorder)

            TextField(L10n.inviteCodePlaceholder, text: $viewModel.inviteCode)
                .textFieldStyle(.roundedBorder)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()

            Button {
                Task { await viewModel.register(with: appState) }
            } label: {
                Group {
                    if viewModel.isLoading {
                        ProgressView()
                    } else {
                        Text(L10n.registerButton)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
            }
            .buttonStyle(.borderedProminent)
            .disabled(!viewModel.isRegisterValid || viewModel.isLoading)
        }
    }
}
