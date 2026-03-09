import Foundation

struct SessionSummary: Codable, Identifiable, Sendable {
    let sessionId: String
    let title: String
    let createdAt: Double
    let updatedAt: Double
    let messageCount: Int
    let model: String?

    var id: String { sessionId }

    var createdDate: Date { Date(timeIntervalSince1970: createdAt / 1000) }
    var updatedDate: Date { Date(timeIntervalSince1970: updatedAt / 1000) }
}

struct SessionsResponse: Codable, Sendable {
    let sessions: [SessionSummary]
    let isAdmin: Bool
}
