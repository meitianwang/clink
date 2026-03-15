import Foundation
import SwiftUI

// MARK: - Chat Models

enum MessageRole: String, Codable, Sendable {
    case user
    case assistant
}

enum MessageContentType: String, Codable, Sendable {
    case text
    case thinking
    case toolCall = "tool_call"
    case image
}

struct ChatMessageContent: Identifiable, Sendable {
    let id = UUID()
    let type: MessageContentType
    let text: String?
    let thinking: String?
    let toolName: String?
    let arguments: String?
}

struct ChatMessage: Identifiable, Sendable {
    let id: String
    let role: MessageRole
    let content: [ChatMessageContent]
    let timestamp: Date
    var isStreaming: Bool = false

    var displayText: String {
        content.compactMap { $0.text }.joined()
    }

    var thinkingText: String? {
        content.first(where: { $0.type == .thinking })?.thinking
    }

    var toolCalls: [ChatMessageContent] {
        content.filter { $0.type == .toolCall }
    }
}

// MARK: - Chat View Model

@MainActor
@Observable
final class ChatViewModel {
    var messages: [ChatMessage] = []
    var inputText = ""
    var isProcessing = false
    var sessionKey = "default"
    var currentModel: String?

    private var streamBuffer = ""

    func send() async {
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }

        let userMessage = ChatMessage(
            id: UUID().uuidString,
            role: .user,
            content: [ChatMessageContent(type: .text, text: text, thinking: nil, toolName: nil, arguments: nil)],
            timestamp: Date()
        )
        messages.append(userMessage)
        inputText = ""
        isProcessing = true

        // Create placeholder for assistant response
        let assistantId = UUID().uuidString
        var assistantMessage = ChatMessage(
            id: assistantId,
            role: .assistant,
            content: [],
            timestamp: Date(),
            isStreaming: true
        )
        messages.append(assistantMessage)

        do {
            // chat.send returns { ok: true } — actual reply arrives via WebSocket push events.
            // The streaming placeholder will be updated by handlePushEvent().
            _ = try await DaemonConnection.shared.request(
                method: "chat.send",
                params: [
                    "text": text,
                    "sessionKey": sessionKey,
                ],
                timeoutMs: 120_000
            )
            // Don't finalize here — push events handle message updates
        } catch {
            if let idx = messages.firstIndex(where: { $0.id == assistantId }) {
                messages[idx] = ChatMessage(
                    id: assistantId,
                    role: .assistant,
                    content: [ChatMessageContent(type: .text, text: "Error: \(error.localizedDescription)", thinking: nil, toolName: nil, arguments: nil)],
                    timestamp: Date()
                )
            }
        }

        isProcessing = false
    }

    func handlePushEvent(_ event: DaemonPushEvent) {
        let type = event.type
        let payload = event.payload

        switch type {
        case "stream":
            if let chunk = payload["chunk"] as? String {
                streamBuffer += chunk
                // Update last assistant message
                if let idx = messages.lastIndex(where: { $0.role == .assistant && $0.isStreaming }) {
                    messages[idx] = ChatMessage(
                        id: messages[idx].id,
                        role: .assistant,
                        content: [ChatMessageContent(type: .text, text: streamBuffer, thinking: nil, toolName: nil, arguments: nil)],
                        timestamp: messages[idx].timestamp,
                        isStreaming: true
                    )
                }
            }

        case "message":
            streamBuffer = ""
            if let text = payload["text"] as? String, let id = payload["id"] as? String {
                // Finalize streaming message or add new one
                if let idx = messages.lastIndex(where: { $0.role == .assistant && $0.isStreaming }) {
                    messages[idx] = ChatMessage(
                        id: id,
                        role: .assistant,
                        content: [ChatMessageContent(type: .text, text: text, thinking: nil, toolName: nil, arguments: nil)],
                        timestamp: Date()
                    )
                }
                isProcessing = false
            }

        case "tool":
            if let data = payload["data"] as? [String: Any],
               let name = data["name"] as? String {
                let args = (data["arguments"] as? String) ?? ""
                if let idx = messages.lastIndex(where: { $0.role == .assistant && $0.isStreaming }) {
                    var content = messages[idx].content
                    content.append(ChatMessageContent(type: .toolCall, text: nil, thinking: nil, toolName: name, arguments: args))
                    messages[idx] = ChatMessage(
                        id: messages[idx].id,
                        role: .assistant,
                        content: content,
                        timestamp: messages[idx].timestamp,
                        isStreaming: true
                    )
                }
            }

        default:
            break
        }
    }

    func clearMessages() {
        messages.removeAll()
        streamBuffer = ""
    }
}

// MARK: - Chat View

struct NativeChatView: View {
    @State private var viewModel = ChatViewModel()
    @FocusState private var isInputFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            // Messages
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 12) {
                        ForEach(viewModel.messages) { message in
                            ChatBubbleView(message: message)
                                .id(message.id)
                        }
                    }
                    .padding(16)
                }
                .onChange(of: viewModel.messages.count) { _, _ in
                    if let last = viewModel.messages.last {
                        withAnimation(.easeOut(duration: 0.2)) {
                            proxy.scrollTo(last.id, anchor: .bottom)
                        }
                    }
                }
            }

            Divider()

            // Input
            HStack(spacing: 8) {
                TextField("Message...", text: $viewModel.inputText, axis: .vertical)
                    .textFieldStyle(.plain)
                    .lineLimit(1...5)
                    .focused($isInputFocused)
                    .onSubmit {
                        if !viewModel.inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                            Task { await viewModel.send() }
                        }
                    }

                Button {
                    Task { await viewModel.send() }
                } label: {
                    Image(systemName: viewModel.isProcessing ? "stop.circle.fill" : "arrow.up.circle.fill")
                        .font(.title2)
                        .foregroundStyle(viewModel.inputText.isEmpty ? Color.secondary : Color.blue)
                }
                .buttonStyle(.plain)
                .disabled(viewModel.inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !viewModel.isProcessing)
            }
            .padding(12)
        }
        .frame(minWidth: 360, minHeight: 400)
        .onAppear { isInputFocused = true }
    }
}

// MARK: - Chat Bubble

struct ChatBubbleView: View {
    let message: ChatMessage

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            if message.role == .user { Spacer(minLength: 60) }

            VStack(alignment: message.role == .user ? .trailing : .leading, spacing: 4) {
                // Tool calls
                ForEach(message.toolCalls) { tool in
                    HStack(spacing: 4) {
                        Image(systemName: "wrench.and.screwdriver")
                            .font(.caption2)
                        Text(tool.toolName ?? "tool")
                            .font(.caption)
                    }
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 2)
                    .background(Color.secondary.opacity(0.1), in: Capsule())
                }

                // Thinking
                if let thinking = message.thinkingText, !thinking.isEmpty {
                    DisclosureGroup("Thinking...") {
                        Text(thinking)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(8)
                }

                // Main text
                if !message.displayText.isEmpty {
                    Text(message.displayText)
                        .textSelection(.enabled)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(bubbleBackground)
                        .clipShape(ChatBubbleShape(isUser: message.role == .user))
                }

                // Streaming indicator
                if message.isStreaming {
                    HStack(spacing: 4) {
                        ProgressView()
                            .controlSize(.mini)
                        Text("Thinking...")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .frame(maxWidth: 560, alignment: message.role == .user ? .trailing : .leading)

            if message.role == .assistant { Spacer(minLength: 60) }
        }
    }

    private var bubbleBackground: Color {
        message.role == .user ? Color.blue : Color.secondary.opacity(0.15)
    }
}

// MARK: - Bubble Shape

struct ChatBubbleShape: Shape {
    let isUser: Bool
    let cornerRadius: CGFloat = 18
    let tailWidth: CGFloat = 7
    let tailHeight: CGFloat = 9

    func path(in rect: CGRect) -> Path {
        var path = Path()
        let r = cornerRadius
        let tw = tailWidth
        let th = tailHeight

        if isUser {
            // Tail on bottom-right
            path.addRoundedRect(
                in: CGRect(x: rect.minX, y: rect.minY, width: rect.width - tw, height: rect.height),
                cornerSize: CGSize(width: r, height: r)
            )
            // Tail
            path.move(to: CGPoint(x: rect.maxX - tw, y: rect.maxY - th))
            path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
            path.addLine(to: CGPoint(x: rect.maxX - tw, y: rect.maxY))
        } else {
            // Tail on bottom-left
            path.addRoundedRect(
                in: CGRect(x: rect.minX + tw, y: rect.minY, width: rect.width - tw, height: rect.height),
                cornerSize: CGSize(width: r, height: r)
            )
            // Tail
            path.move(to: CGPoint(x: rect.minX + tw, y: rect.maxY - th))
            path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
            path.addLine(to: CGPoint(x: rect.minX + tw, y: rect.maxY))
        }

        return path
    }
}
