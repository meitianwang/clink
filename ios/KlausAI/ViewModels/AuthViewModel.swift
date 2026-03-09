import Foundation

/// ViewModel for login and register forms.
@Observable
final class AuthViewModel {
    var email = ""
    var password = ""
    var displayName = ""
    var inviteCode = ""
    var isLoading = false
    var errorMessage: String?
    var isRegisterMode = false

    var isLoginValid: Bool {
        !email.trimmingCharacters(in: .whitespaces).isEmpty && password.count >= 8
    }

    var isRegisterValid: Bool {
        isLoginValid && !displayName.trimmingCharacters(in: .whitespaces).isEmpty
    }

    func login(with appState: AppState) async {
        isLoading = true
        errorMessage = nil
        do {
            try await appState.login(email: email.trimmingCharacters(in: .whitespaces).lowercased(), password: password)
        } catch let error as APIError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func register(with appState: AppState) async {
        isLoading = true
        errorMessage = nil
        do {
            try await appState.register(
                email: email.trimmingCharacters(in: .whitespaces).lowercased(),
                password: password,
                displayName: displayName.trimmingCharacters(in: .whitespaces),
                inviteCode: inviteCode.trimmingCharacters(in: .whitespaces)
            )
        } catch let error as APIError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}
