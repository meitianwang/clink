import Foundation

/// WebSocket message sent from client to server.
enum ClientMessage: Sendable {
    case message(text: String, sessionId: String, files: [String])
    case permission(requestId: String, allow: Bool)
    case pong

    func encode() -> Data? {
        var dict: [String: Any] = [:]

        switch self {
        case .message(let text, let sessionId, let files):
            dict["type"] = "message"
            dict["text"] = text
            dict["sessionId"] = sessionId
            if !files.isEmpty {
                dict["files"] = files
            }

        case .permission(let requestId, let allow):
            dict["type"] = "permission"
            dict["requestId"] = requestId
            dict["allow"] = allow

        case .pong:
            dict["type"] = "pong"
        }

        return try? JSONSerialization.data(withJSONObject: dict)
    }
}
