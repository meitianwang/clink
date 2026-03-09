import SwiftUI

/// A single row in the session list, showing title from first message.
struct SessionRow: View {
    let session: SessionSummary
    let isActive: Bool

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(displayTitle)
                    .font(.subheadline.weight(isActive ? .semibold : .regular))
                    .lineLimit(1)

                HStack(spacing: 8) {
                    Text("\(session.messageCount) 条消息")
                        .font(.caption2)
                        .foregroundStyle(.secondary)

                    Text(session.updatedDate.relativeString)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)

                    if let model = session.model {
                        Text(modelShortName(model))
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                    }
                }
            }

            Spacer()

            if isActive {
                Circle()
                    .fill(.accent)
                    .frame(width: 8, height: 8)
            }
        }
        .padding(.vertical, 2)
        .listRowBackground(isActive ? Color.accentColor.opacity(0.08) : nil)
    }

    /// Use session title (from first message) or fallback to "新对话"
    private var displayTitle: String {
        if session.title.isEmpty {
            return L10n.newChat
        }
        // Truncate long titles
        if session.title.count > 40 {
            return String(session.title.prefix(40)) + "..."
        }
        return session.title
    }

    /// Shorten model name for display
    private func modelShortName(_ model: String) -> String {
        if model.contains("opus") { return "Opus" }
        if model.contains("sonnet") { return "Sonnet" }
        if model.contains("haiku") { return "Haiku" }
        return model
    }
}
