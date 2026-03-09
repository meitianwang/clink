import Foundation

/// Decoded WebSocket message from server.
enum ServerMessage: Sendable {
    case message(text: String, id: String, sessionId: String?)
    case stream(chunk: String, sessionId: String?)
    case merged(sessionId: String?)
    case error(message: String, sessionId: String?)
    case ping
    case tool(payload: ToolEventPayload, sessionId: String?)
    case permission(payload: PermissionRequestPayload, sessionId: String?)
    case file(url: String, name: String, sessionId: String?)
    case configUpdated
    case unknown(type: String)

    /// Decode a raw JSON WebSocket message into a ServerMessage.
    static func decode(from data: Data) -> ServerMessage? {
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = json["type"] as? String else {
            return nil
        }

        let sessionId = json["sessionId"] as? String

        switch type {
        case "message":
            guard let text = json["text"] as? String,
                  let id = json["id"] as? String else { return nil }
            return .message(text: text, id: id, sessionId: sessionId)

        case "stream":
            guard let chunk = json["chunk"] as? String else { return nil }
            return .stream(chunk: chunk, sessionId: sessionId)

        case "merged":
            return .merged(sessionId: sessionId)

        case "error":
            let message = json["message"] as? String ?? "Unknown error"
            return .error(message: message, sessionId: sessionId)

        case "ping":
            return .ping

        case "tool":
            guard let dataObj = json["data"],
                  let dataJson = try? JSONSerialization.data(withJSONObject: dataObj),
                  let payload = try? JSONDecoder().decode(ToolEventPayload.self, from: dataJson) else {
                return nil
            }
            return .tool(payload: payload, sessionId: sessionId)

        case "permission":
            guard let dataObj = json["data"],
                  let dataJson = try? JSONSerialization.data(withJSONObject: dataObj),
                  let payload = try? JSONDecoder().decode(PermissionRequestPayload.self, from: dataJson) else {
                return nil
            }
            return .permission(payload: payload, sessionId: sessionId)

        case "file":
            guard let url = json["url"] as? String,
                  let name = json["name"] as? String else { return nil }
            return .file(url: url, name: name, sessionId: sessionId)

        case "config_updated":
            return .configUpdated

        default:
            return .unknown(type: type)
        }
    }
}
