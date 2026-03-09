import Foundation

/// Permission request from Claude when it wants to use a tool that requires approval.
struct PermissionRequest: Identifiable, Sendable {
    let requestId: String
    let toolName: String
    let toolUseId: String
    let input: [String: JSONValue]
    let description: String?
    let display: ToolDisplay

    var id: String { requestId }
}

/// Raw permission request payload from WebSocket.
struct PermissionRequestPayload: Codable, Sendable {
    let requestId: String
    let toolName: String
    let toolUseId: String
    let input: [String: JSONValue]
    let description: String?
    let display: ToolDisplay
}
