import AppKit
import SwiftUI

/// First-run onboarding wizard.
@MainActor
final class OnboardingController {
    static let shared = OnboardingController()

    private var window: NSWindow?

    func showIfNeeded() {
        guard !AppState.shared.onboardingSeen else { return }
        show()
    }

    func show() {
        if let existing = window, existing.isVisible {
            existing.makeKeyAndOrderFront(nil)
            return
        }

        let view = OnboardingView {
            AppState.shared.onboardingSeen = true
            self.window?.close()
            self.window = nil
        }

        let hostingView = NSHostingView(rootView: view)
        let win = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 520, height: 480),
            styleMask: [.titled, .closable],
            backing: .buffered,
            defer: false
        )
        win.title = "Welcome to Klaus"
        win.contentView = hostingView
        win.center()
        win.isReleasedWhenClosed = false
        win.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        window = win
    }
}

// MARK: - Onboarding View

struct OnboardingView: View {
    let onFinish: () -> Void
    @State private var page = 0
    @State private var cliFound = false
    @State private var nodeFound = false
    @State private var isChecking = false

    private let totalPages = 4

    var body: some View {
        VStack(spacing: 0) {
            // Page content
            Group {
                switch page {
                case 0: welcomePage
                case 1: environmentPage
                case 2: configPage
                case 3: finishPage
                default: EmptyView()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .padding(32)

            Divider()

            // Navigation
            HStack {
                if page > 0 {
                    Button("Back") { page -= 1 }
                }
                Spacer()

                // Page indicator
                HStack(spacing: 6) {
                    ForEach(0..<totalPages, id: \.self) { i in
                        Circle()
                            .fill(i == page ? Color.accentColor : Color.secondary.opacity(0.3))
                            .frame(width: 8, height: 8)
                    }
                }

                Spacer()

                if page < totalPages - 1 {
                    Button("Next") { page += 1 }
                        .keyboardShortcut(.defaultAction)
                } else {
                    Button("Get Started") { onFinish() }
                        .keyboardShortcut(.defaultAction)
                }
            }
            .padding(16)
        }
    }

    // MARK: - Pages

    private var welcomePage: some View {
        VStack(spacing: 20) {
            Image(systemName: "bubble.left.and.text.bubble.right")
                .font(.system(size: 64))
                .foregroundStyle(.blue)

            Text("Welcome to Klaus")
                .font(.largeTitle.bold())

            Text("Klaus bridges Claude Code to a browser-based Web Chat UI, running as a menu bar app on your Mac.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .frame(maxWidth: 380)
        }
    }

    private var environmentPage: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Environment Check")
                .font(.title2.bold())

            VStack(alignment: .leading, spacing: 12) {
                CheckRow(
                    label: "Node.js",
                    detail: DaemonEnvironment.shared.status.nodeVersion ?? "not found",
                    ok: DaemonEnvironment.shared.status.nodeAvailable
                )

                CheckRow(
                    label: "Klaus CLI",
                    detail: DaemonEnvironment.shared.status.klausBinaryPath ?? "not found",
                    ok: DaemonEnvironment.shared.status.klausAvailable
                )
            }

            if !DaemonEnvironment.shared.status.klausAvailable {
                GroupBox {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Install Klaus CLI:")
                            .font(.headline)
                        Text("npm install -g klaus-ai")
                            .font(.system(.body, design: .monospaced))
                            .textSelection(.enabled)
                    }
                    .padding(4)
                }
            }

            Button("Re-check") {
                DaemonEnvironment.shared.refresh()
            }

            Spacer()
        }
    }

    private var configPage: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Configuration")
                .font(.title2.bold())

            Text("Klaus stores its configuration at:")
                .foregroundStyle(.secondary)

            Text(KlausPaths.configFile)
                .font(.system(.body, design: .monospaced))
                .textSelection(.enabled)
                .padding(8)
                .background(Color.secondary.opacity(0.1), in: RoundedRectangle(cornerRadius: 6))

            if FileManager.default.fileExists(atPath: KlausPaths.configFile) {
                Label("Config file found", systemImage: "checkmark.circle.fill")
                    .foregroundStyle(.green)
            } else {
                Label("No config file yet", systemImage: "exclamationmark.triangle")
                    .foregroundStyle(.orange)
                Text("Run `klaus setup` in Terminal to create one, or Klaus will prompt you on first start.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()
        }
    }

    private var finishPage: some View {
        VStack(spacing: 20) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 64))
                .foregroundStyle(.green)

            Text("You're All Set!")
                .font(.title.bold())

            VStack(alignment: .leading, spacing: 8) {
                FeatureRow(icon: "menubar.rectangle", text: "Klaus lives in your menu bar")
                FeatureRow(icon: "globe", text: "Click the icon to open Web Chat")
                FeatureRow(icon: "gearshape", text: "Use Settings to configure features")
                FeatureRow(icon: "clock.arrow.circlepath", text: "Schedule tasks with Cron")
            }
            .padding(.top, 8)
        }
    }
}

// MARK: - Helper Views

private struct CheckRow: View {
    let label: String
    let detail: String
    let ok: Bool

    var body: some View {
        HStack {
            Image(systemName: ok ? "checkmark.circle.fill" : "xmark.circle.fill")
                .foregroundStyle(ok ? .green : .red)
            Text(label)
                .fontWeight(.medium)
            Spacer()
            Text(detail)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .truncationMode(.middle)
        }
    }
}

private struct FeatureRow: View {
    let icon: String
    let text: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .frame(width: 24)
                .foregroundStyle(.blue)
            Text(text)
        }
    }
}
