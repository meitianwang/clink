import Foundation

struct User: Codable, Identifiable, Sendable {
    let id: String
    let email: String
    let displayName: String
    let role: String

    var isAdmin: Bool { role == "admin" }
}

struct AuthResponse: Codable, Sendable {
    let user: User
}

struct AuthMeResponse: Codable, Sendable {
    let user: User
    let hasGoogle: Bool?
}

struct AuthErrorResponse: Codable, Sendable {
    let error: String
}
