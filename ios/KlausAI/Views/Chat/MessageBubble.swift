import SwiftUI

/// Single message bubble with different styles for user and assistant.
struct MessageBubble: View {
    let message: ChatMessage
    let baseURL: URL

    var body: some View {
        VStack(alignment: message.role == .user ? .trailing : .leading, spacing: 8) {
            // Tool events (assistant only, with nesting support)
            if message.role == .assistant && !message.toolEvents.isEmpty {
                ToolEventsListView(events: message.toolEvents)
            }

            // Message content
            HStack {
                if message.role == .user { Spacer(minLength: 60) }

                VStack(alignment: .leading, spacing: 4) {
                    if message.isStreaming && message.content.isEmpty {
                        StreamingIndicator()
                    } else if message.isStreaming {
                        // Streaming: show text with blinking cursor
                        HStack(alignment: .bottom, spacing: 0) {
                            Text(message.content)
                                .textSelection(.enabled)
                                .font(.body)
                            StreamingCursor()
                        }
                    } else if message.role == .system {
                        // System messages (slash command results)
                        Text(message.content)
                            .font(.callout)
                            .foregroundStyle(.secondary)
                    } else {
                        MarkdownText(message.content)
                    }

                    // Attached files with download support
                    if !message.attachedFiles.isEmpty {
                        ForEach(message.attachedFiles) { file in
                            FileAttachmentCard(file: file, baseURL: baseURL)
                        }
                    }

                    // Timestamp
                    Text(message.timestamp.shortTimeString)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(bubbleBackground)
                .clipShape(RoundedRectangle(cornerRadius: 16))

                if message.role == .assistant { Spacer(minLength: 40) }
            }
        }
        .frame(maxWidth: .infinity, alignment: message.role == .user ? .trailing : .leading)
    }

    private var bubbleBackground: Color {
        switch message.role {
        case .user: return Color.accentColor.opacity(0.12)
        case .assistant: return Color(.systemGray6)
        case .system: return Color(.systemGray5).opacity(0.5)
        }
    }
}

/// Blinking cursor shown at end of streaming text.
private struct StreamingCursor: View {
    @State private var visible = true

    var body: some View {
        Rectangle()
            .fill(Color.primary)
            .frame(width: 2, height: 16)
            .opacity(visible ? 1 : 0)
            .animation(
                .easeInOut(duration: 0.5).repeatForever(autoreverses: true),
                value: visible
            )
            .onAppear { visible = false }
    }
}

/// File attachment card with download link and file type badge.
private struct FileAttachmentCard: View {
    let file: AttachedFile
    let baseURL: URL

    var body: some View {
        Button {
            guard let urlPath = file.url else { return }
            let fullURL = baseURL.appendingPathComponent(urlPath)
            UIApplication.shared.open(fullURL)
        } label: {
            HStack(spacing: 8) {
                // File type icon badge
                ZStack {
                    RoundedRectangle(cornerRadius: 6)
                        .fill(badgeColor)
                        .frame(width: 32, height: 32)
                    Image(systemName: fileIcon)
                        .font(.caption)
                        .foregroundStyle(.white)
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text(file.name)
                        .font(.caption)
                        .lineLimit(1)
                        .foregroundStyle(.primary)
                    Text(extensionBadge)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                Image(systemName: "arrow.down.circle")
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(Color(.systemGray5))
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(.plain)
    }

    private var fileIcon: String {
        switch file.type {
        case .image: return "photo"
        case .audio: return "waveform"
        case .video: return "play.rectangle.fill"
        case .file: return "doc.fill"
        }
    }

    private var badgeColor: Color {
        switch file.type {
        case .image: return .blue
        case .audio: return .purple
        case .video: return .red
        case .file: return .gray
        }
    }

    private var extensionBadge: String {
        let ext = (file.name as NSString).pathExtension.uppercased()
        return ext.isEmpty ? file.type.rawValue.uppercased() : ext
    }
}
