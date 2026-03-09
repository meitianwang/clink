import SwiftUI

/// Displays tool events with agent nesting support.
/// Top-level events are shown directly; sub-agent events are grouped
/// in collapsible containers linked by parentToolUseId.
struct ToolEventsListView: View {
    let events: [ToolEvent]

    var body: some View {
        let topLevel = events.filter { $0.parentToolUseId == nil }
        let grouped = Dictionary(grouping: events.filter { $0.parentToolUseId != nil }) { $0.parentToolUseId! }

        VStack(alignment: .leading, spacing: 4) {
            ForEach(topLevel) { event in
                if event.toolName == "Agent" || event.toolName == "agent",
                   let children = grouped[event.toolUseId], !children.isEmpty {
                    AgentContainerView(agentEvent: event, children: children)
                } else {
                    ToolEventRow(event: event)
                }
            }
        }
    }
}

/// Collapsible agent container showing nested tool events.
private struct AgentContainerView: View {
    let agentEvent: ToolEvent
    let children: [ToolEvent]
    @State private var isExpanded = true

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            // Agent header (tap to expand/collapse)
            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    isExpanded.toggle()
                }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
                        .font(.caption2)
                        .foregroundStyle(.secondary)

                    Image(systemName: "cpu")
                        .font(.caption)
                        .foregroundStyle(statusColor(agentEvent.status))

                    Text(agentEvent.display.label)
                        .font(.caption.bold())
                        .foregroundStyle(.secondary)

                    if !agentEvent.display.value.isEmpty {
                        Text(agentEvent.display.value)
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                            .lineLimit(1)
                    }

                    Spacer()

                    Text("\(children.count)")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(Color(.systemGray6).opacity(0.6))
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .opacity(agentEvent.status == .completed ? 0.5 : 1.0)

            // Nested children
            if isExpanded {
                VStack(alignment: .leading, spacing: 2) {
                    ForEach(children) { child in
                        ToolEventRow(event: child)
                            .padding(.leading, 16)
                    }
                }
            }
        }
    }

    private func statusColor(_ status: ToolEvent.Status) -> Color {
        switch status {
        case .running: return .orange
        case .completed: return .green
        case .error: return .red
        }
    }
}

/// Single tool event row with status icon and display info.
struct ToolEventRow: View {
    let event: ToolEvent
    @State private var isPulsing = false

    var body: some View {
        HStack(spacing: 8) {
            // Status icon
            Group {
                switch event.status {
                case .running:
                    Image(systemName: iconName)
                        .foregroundStyle(.orange)
                        .opacity(isPulsing ? 0.4 : 1.0)
                        .animation(
                            .easeInOut(duration: 0.8).repeatForever(autoreverses: true),
                            value: isPulsing
                        )
                        .onAppear { isPulsing = true }
                case .completed:
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                case .error:
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.red)
                }
            }
            .font(.caption)

            // Label + value
            VStack(alignment: .leading, spacing: 2) {
                Text(event.display.label)
                    .font(.caption.bold())
                    .foregroundStyle(.secondary)

                if !event.display.value.isEmpty {
                    Text(event.display.style == "terminal" ? "$ \(event.display.value)" : event.display.value)
                        .font(.caption2.monospaced())
                        .foregroundStyle(.tertiary)
                        .lineLimit(2)
                }

                if let secondary = event.display.secondary, !secondary.isEmpty {
                    Text(secondary)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                        .lineLimit(1)
                }
            }

            Spacer()
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(Color(.systemGray6).opacity(0.6))
        .clipShape(RoundedRectangle(cornerRadius: 8))
        // Completed tools fade out (matching Web's opacity: 0.35)
        .opacity(event.status == .completed ? 0.45 : 1.0)
        .animation(.easeOut(duration: 0.3), value: event.status)
    }

    private var iconName: String {
        switch event.display.style {
        case "terminal": return "terminal"
        case "file": return "doc.text"
        case "search": return "magnifyingglass"
        case "network": return "globe"
        case "destructive": return "exclamationmark.triangle"
        default: return "gearshape"
        }
    }
}
