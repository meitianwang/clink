import SwiftUI

/// Single message row — DeepSeek-inspired minimal style.
/// Assistant: no avatar, no bubble, full-width text.
/// User: right-aligned gray bubble, no avatar.
struct MessageBubble: View {
    let message: ChatMessage
    let baseURL: URL

    var body: some View {
        switch message.role {
        case .user:
            userRow
        case .assistant:
            assistantRow
        case .system:
            systemRow
        }
    }

    // MARK: - User message (right-aligned gray bubble)

    private var userRow: some View {
        HStack {
            Spacer(minLength: 60)
            VStack(alignment: .trailing, spacing: 6) {
                // Attached files
                if !message.attachedFiles.isEmpty {
                    ForEach(message.attachedFiles) { file in
                        FileAttachmentCard(file: file, baseURL: baseURL)
                    }
                }

                Text(message.content)
                    .font(.system(size: 14.5))
                    .lineSpacing(3)
                    .textSelection(.enabled)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(Color(.systemGray5))
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))

                Text(message.timestamp.shortTimeString)
                    .font(.system(size: 11, weight: .regular))
                    .foregroundStyle(.tertiary)
                    .padding(.trailing, 4)
            }
        }
    }

    // MARK: - Assistant message (full-width, no bubble, no avatar)

    private var assistantRow: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Tool events
            if !message.toolEvents.isEmpty {
                ToolEventsListView(events: message.toolEvents)
            }

            // Content
            if message.isStreaming && message.content.isEmpty {
                StreamingIndicator()
                    .padding(.leading, 4)
            } else if message.isStreaming {
                HStack(alignment: .bottom, spacing: 0) {
                    Text(message.content)
                        .font(.system(size: 14.5))
                        .lineSpacing(3)
                        .textSelection(.enabled)
                    StreamingCursor()
                }
            } else {
                MarkdownText(message.content)
            }

            // Attached files
            if !message.attachedFiles.isEmpty {
                ForEach(message.attachedFiles) { file in
                    FileAttachmentCard(file: file, baseURL: baseURL)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - System message

    private var systemRow: some View {
        Text(message.content)
            .font(.system(.callout))
            .foregroundStyle(.secondary)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(.systemGray6).opacity(0.6))
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
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
