import SwiftUI

/// Bottom sheet for approving/denying tool permission requests (Chinese localized).
struct PermissionSheet: View {
    let permission: PermissionRequest
    let onDecision: (Bool) -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 24) {
            // Header
            VStack(spacing: 8) {
                Image(systemName: headerIcon)
                    .font(.title)
                    .foregroundStyle(headerColor)

                Text(L10n.permissionTitle)
                    .font(.headline)

                Text(permission.display.label)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            .padding(.top, 20)

            // Details
            VStack(alignment: .leading, spacing: 12) {
                DetailRow(label: L10n.toolLabel, value: permission.toolName)

                if !permission.display.value.isEmpty {
                    DetailRow(
                        label: L10n.actionLabel,
                        value: permission.display.style == "terminal"
                            ? "$ \(permission.display.value)"
                            : permission.display.value,
                        monospaced: true
                    )
                }

                if let secondary = permission.display.secondary {
                    DetailRow(label: L10n.detailsLabel, value: secondary)
                }

                if let desc = permission.description {
                    DetailRow(label: L10n.reasonLabel, value: desc)
                }
            }
            .padding(.horizontal, 20)

            Spacer()

            // Action buttons
            HStack(spacing: 16) {
                Button {
                    onDecision(false)
                    dismiss()
                } label: {
                    Text(L10n.deny)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                }
                .buttonStyle(.bordered)
                .tint(.red)

                Button {
                    onDecision(true)
                    dismiss()
                } label: {
                    Text(L10n.allow)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                }
                .buttonStyle(.borderedProminent)
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 20)
        }
    }

    private var headerIcon: String {
        switch permission.display.style {
        case "destructive": return "exclamationmark.shield.fill"
        case "terminal": return "terminal.fill"
        case "file": return "doc.fill"
        default: return "shield.checkered"
        }
    }

    private var headerColor: Color {
        permission.display.style == "destructive" ? .red : .orange
    }
}

private struct DetailRow: View {
    let label: String
    let value: String
    var monospaced = false

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(value)
                .font(monospaced ? .callout.monospaced() : .callout)
                .lineLimit(5)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color(.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}
