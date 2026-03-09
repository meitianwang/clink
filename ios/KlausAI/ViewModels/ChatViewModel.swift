import Foundation

/// Core chat ViewModel: manages messages, streaming, tool events, permissions,
/// slash commands, and config notifications.
@Observable
final class ChatViewModel {
    var messages: [ChatMessage] = []
    var inputText = ""
    var isProcessing = false
    var pendingPermission: PermissionRequest?
    var errorMessage: String?
    var currentSessionId = "default"
    var currentSessionTitle: String?
    var uploadedFiles: [UploadedFile] = []
    var configUpdateBanner = false

    let appState: AppState
    private var streamBuffer = ""
    private var streamThrottleTask: Task<Void, Never>?
    private var configBannerDismissTask: Task<Void, Never>?

    init(appState: AppState) {
        self.appState = appState
        appState.webSocket.onServerMessage = { [weak self] msg in
            self?.handleServerMessage(msg)
        }
    }

    // MARK: - Actions

    func sendMessage() async {
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty || !uploadedFiles.isEmpty else { return }

        // Handle slash commands locally (don't send to backend)
        if text.hasPrefix("/") {
            inputText = ""
            handleSlashCommand(text)
            return
        }

        let userMessage = ChatMessage(role: .user, content: text)
        messages.append(userMessage)
        inputText = ""
        isProcessing = true
        errorMessage = nil

        // Create placeholder assistant message for streaming
        let assistantMessage = ChatMessage(role: .assistant, content: "", isStreaming: true)
        messages.append(assistantMessage)

        // Send via WebSocket
        appState.webSocket.send(.message(
            text: text,
            sessionId: currentSessionId,
            files: uploadedFiles.map(\.id)
        ))
        uploadedFiles = []

        HapticManager.impact(.light)
    }

    func approvePermission(_ allow: Bool) {
        guard let permission = pendingPermission else { return }
        appState.webSocket.send(.permission(requestId: permission.requestId, allow: allow))
        pendingPermission = nil
        HapticManager.impact(allow ? .medium : .light)
    }

    func loadHistory() async {
        do {
            let response = try await appState.api.fetchHistory(
                sessionId: currentSessionId
            )
            let loaded = response.messages.map { transcript in
                ChatMessage(
                    role: transcript.role == "user" ? .user : .assistant,
                    content: transcript.content,
                    timestamp: transcript.date
                )
            }
            messages = loaded
        } catch {
            print("[Chat] Failed to load history: \(error)")
        }
    }

    func switchSession(_ sessionId: String, title: String? = nil) async {
        currentSessionId = sessionId
        currentSessionTitle = title
        messages = []
        isProcessing = false
        pendingPermission = nil
        errorMessage = nil
        streamBuffer = ""
        await loadHistory()
    }

    func newSession() {
        let id = "s-\(Int(Date().timeIntervalSince1970 * 1000))"
        currentSessionId = id
        currentSessionTitle = nil
        messages = []
        isProcessing = false
        pendingPermission = nil
        errorMessage = nil
        streamBuffer = ""
        addSystemMessage(L10n.newSessionCreated)
    }

    func removeUploadedFile(_ file: UploadedFile) {
        uploadedFiles.removeAll { $0.id == file.id }
    }

    // MARK: - Slash commands (handled locally, matching Web frontend)

    private func handleSlashCommand(_ text: String) {
        let parts = text.split(separator: " ", maxSplits: 1)
        let command = String(parts[0]).lowercased()
        let arg = parts.count > 1 ? String(parts[1]).trimmingCharacters(in: .whitespaces) : nil

        switch command {
        case "/new":
            newSession()

        case "/clear", "/reset":
            messages = []
            addSystemMessage(L10n.sessionCleared)

        case "/help":
            addSystemMessage(L10n.helpText)

        case "/model":
            if let modelName = arg, !modelName.isEmpty {
                appState.webSocket.send(.message(
                    text: "/model \(modelName)",
                    sessionId: currentSessionId,
                    files: []
                ))
                addSystemMessage("模型已切换为: \(modelName)")
            } else {
                let current = appState.currentUser?.role == "admin" ? "admin" : "user"
                addSystemMessage("当前角色: \(current)\n输入 /model <名称> 切换模型")
            }

        case "/session":
            addSystemMessage("会话 ID: \(currentSessionId)\n消息数: \(messages.count)")

        default:
            addSystemMessage("未知命令: \(command)\n输入 /help 查看可用命令")
        }
    }

    private func addSystemMessage(_ text: String) {
        messages.append(ChatMessage(role: .system, content: text))
    }

    // MARK: - WebSocket message handling

    private func handleServerMessage(_ message: ServerMessage) {
        switch message {
        case .stream(let chunk, let sessionId):
            guard matchesSession(sessionId) else { return }
            appendStreamChunk(chunk)

        case .message(let text, _, let sessionId):
            guard matchesSession(sessionId) else { return }
            finalizeAssistantMessage(text)
            isProcessing = false
            HapticManager.notification(.success)

        case .merged(let sessionId):
            guard matchesSession(sessionId) else { return }
            isProcessing = false

        case .error(let msg, let sessionId):
            guard matchesSession(sessionId) else { return }
            removeStreamingMessage()
            errorMessage = L10n.mapErrorCode(msg)
            isProcessing = false
            HapticManager.notification(.error)

        case .tool(let payload, let sessionId):
            guard matchesSession(sessionId) else { return }
            handleToolEvent(payload)

        case .permission(let payload, let sessionId):
            guard matchesSession(sessionId) else { return }
            pendingPermission = PermissionRequest(
                requestId: payload.requestId,
                toolName: payload.toolName,
                toolUseId: payload.toolUseId,
                input: payload.input,
                description: payload.description,
                display: payload.display
            )
            HapticManager.notification(.warning)

        case .file(let url, let name, let sessionId):
            guard matchesSession(sessionId) else { return }
            if let last = messages.last, last.role == .assistant {
                let ext = (name as NSString).pathExtension.lowercased()
                let fileType: AttachedFile.FileType
                if ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"].contains(ext) {
                    fileType = .image
                } else if ["mp3", "wav", "aac", "ogg", "m4a"].contains(ext) {
                    fileType = .audio
                } else if ["mp4", "mov", "avi", "mkv", "webm"].contains(ext) {
                    fileType = .video
                } else {
                    fileType = .file
                }
                last.attachedFiles.append(AttachedFile(
                    id: UUID().uuidString,
                    name: name,
                    url: url,
                    type: fileType
                ))
            }

        case .configUpdated:
            configUpdateBanner = true
            configBannerDismissTask?.cancel()
            configBannerDismissTask = Task { @MainActor in
                try? await Task.sleep(for: .seconds(15))
                self.configUpdateBanner = false
            }

        case .ping, .unknown:
            break
        }
    }

    private func matchesSession(_ sessionId: String?) -> Bool {
        guard let sessionId else { return true }
        return sessionId == currentSessionId
    }

    private func appendStreamChunk(_ chunk: String) {
        streamBuffer += chunk

        // Throttle UI updates (100ms matching Web frontend)
        if streamThrottleTask == nil {
            streamThrottleTask = Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(100))
                self.flushStreamBuffer()
                self.streamThrottleTask = nil
            }
        }
    }

    private func flushStreamBuffer() {
        guard !streamBuffer.isEmpty else { return }
        if let last = messages.last, last.role == .assistant, last.isStreaming {
            last.content += streamBuffer
            streamBuffer = ""
        }
    }

    private func finalizeAssistantMessage(_ text: String) {
        streamThrottleTask?.cancel()
        streamThrottleTask = nil
        streamBuffer = ""

        if let last = messages.last, last.role == .assistant, last.isStreaming {
            last.content = text
            last.isStreaming = false
        }
    }

    private func removeStreamingMessage() {
        streamThrottleTask?.cancel()
        streamThrottleTask = nil
        streamBuffer = ""

        if let last = messages.last, last.role == .assistant, last.isStreaming {
            messages.removeLast()
        }
    }

    private func handleToolEvent(_ payload: ToolEventPayload) {
        guard let last = messages.last, last.role == .assistant else { return }

        if payload.type == "tool_start" {
            let event = ToolEvent(
                toolUseId: payload.toolUseId,
                toolName: payload.toolName,
                display: payload.display ?? ToolDisplay(
                    icon: "gear",
                    label: payload.toolName,
                    style: "default",
                    value: "",
                    secondary: nil
                ),
                status: .running,
                parentToolUseId: payload.parentToolUseId,
                timestamp: Date(timeIntervalSince1970: payload.timestamp / 1000)
            )
            last.toolEvents.append(event)
        } else if payload.type == "tool_result" {
            if let idx = last.toolEvents.firstIndex(where: { $0.toolUseId == payload.toolUseId }) {
                last.toolEvents[idx].status = (payload.isError == true) ? .error : .completed
            }
        }
    }
}
