import AppKit
import SwiftUI

/// Menu bar menu content — status, controls, quick actions.
/// Matches OpenClaw's MenuContentView with all feature toggles.
struct MenuContentView: View {
    let state: AppState
    let daemonManager: DaemonProcessManager

    var body: some View {
        // Status header
        Section {
            Label {
                Text(daemonManager.status.displayText)
            } icon: {
                StatusIcon(status: daemonManager.status, isPaused: state.isPaused)
            }

            if HeartbeatStore.shared.isReceiving,
               let hb = HeartbeatStore.shared.lastHeartbeat {
                Label {
                    Text("Last heartbeat: \(hb.timestamp, style: .relative) ago")
                        .font(.caption)
                } icon: {
                    Image(systemName: "heart.fill")
                        .foregroundStyle(.pink)
                }
            }
        }

        Divider()

        // Daemon controls
        Section {
            if state.isPaused {
                Button("Resume") {
                    state.isPaused = false
                    daemonManager.setActive(true)
                }
            } else {
                Button("Pause") {
                    state.isPaused = true
                    daemonManager.stop()
                }
            }

            if !daemonManager.status.isActive && !state.isPaused {
                Button("Start Daemon") {
                    daemonManager.start()
                }
            }

            if daemonManager.status.isActive {
                Button("Restart Daemon") {
                    daemonManager.stop()
                    Task {
                        try? await Task.sleep(for: .milliseconds(500))
                        await MainActor.run { daemonManager.start() }
                    }
                }
            }
        }

        Divider()

        // Feature toggles
        Section {
            Toggle("Voice Wake", isOn: Binding(
                get: { state.voiceWakeEnabled },
                set: { newValue in
                    state.voiceWakeEnabled = newValue
                    Task {
                        if newValue {
                            await VoiceWakeRuntime.shared.start()
                        } else {
                            await VoiceWakeRuntime.shared.stop()
                        }
                    }
                }
            ))

            Toggle("Canvas", isOn: Binding(
                get: { state.canvasEnabled },
                set: { state.canvasEnabled = $0 }
            ))

            if state.talkEnabled {
                Button("Talk Mode") {
                    Task { await TalkModeRuntime.shared.start() }
                }
            }
        }

        Divider()

        // Quick actions
        Section {
            Button("Open Chat Panel") {
                WebChatManager.shared.show()
            }
            .keyboardShortcut("o")

            Button("Open in Browser") {
                let port = defaultDaemonPort
                if let url = URL(string: "http://localhost:\(port)") {
                    NSWorkspace.shared.open(url)
                }
            }
        }

        // Usage
        if UsageCostStore.shared.usage.totalTokens > 0 {
            Divider()
            Section {
                CostUsageMenuView(usage: UsageCostStore.shared.usage)
            }
        }

        Divider()

        // App controls
        Section {
            SettingsLink {
                Text("Settings…")
            }
            .keyboardShortcut(",")

            Button("Quit Klaus") {
                NSApplication.shared.terminate(nil)
            }
            .keyboardShortcut("q")
        }
    }
}
