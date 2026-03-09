import Foundation

/// Tool invocation event from Claude, displayed inline in assistant messages.
struct ToolEvent: Identifiable, Sendable {
    let toolUseId: String
    let toolName: String
    let display: ToolDisplay
    var status: Status
    let parentToolUseId: String?
    let timestamp: Date

    var id: String { toolUseId }

    enum Status: Sendable {
        case running
        case completed
        case error
    }
}

/// Display metadata for a tool event, mirrors backend ToolDisplay.
struct ToolDisplay: Codable, Sendable {
    let icon: String
    let label: String
    let style: String
    let value: String
    let secondary: String?
}

/// Raw tool event payload from WebSocket `type: "tool"` messages.
struct ToolEventPayload: Codable, Sendable {
    let type: String       // "tool_start" | "tool_result"
    let toolUseId: String
    let toolName: String
    let timestamp: Double
    let display: ToolDisplay?
    let input: [String: JSONValue]?
    let isError: Bool?
    let parentToolUseId: String?
}
