import SwiftUI

/// SF Symbol-based status icon for the menu bar.
struct StatusIcon: View {
    let status: DaemonProcessManager.Status
    let isPaused: Bool

    var body: some View {
        Image(systemName: iconName)
            .foregroundStyle(iconColor)
    }

    private var iconName: String {
        if isPaused {
            return "pause.circle.fill"
        }
        switch status {
        case .stopped:
            return "circle"
        case .starting:
            return "circle.dotted"
        case .running, .attachedExisting:
            return "circle.fill"
        case .failed:
            return "exclamationmark.circle.fill"
        }
    }

    private var iconColor: Color {
        if isPaused {
            return .secondary
        }
        switch status {
        case .stopped:
            return .secondary
        case .starting:
            return .orange
        case .running, .attachedExisting:
            return .green
        case .failed:
            return .red
        }
    }
}
