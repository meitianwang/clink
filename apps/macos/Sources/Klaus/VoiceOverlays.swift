import AppKit
import SwiftUI

/// Floating overlay shown during voice wake capture and talk mode.
@MainActor
final class VoiceWakeOverlayController {
    static let shared = VoiceWakeOverlayController()

    private var window: NSWindow?
    private(set) var sessionToken: UUID?

    enum OverlayState {
        case idle
        case listening(partial: String)
        case captured(text: String)
        case sending
    }

    private(set) var state: OverlayState = .idle

    func startSession() -> UUID {
        let token = UUID()
        sessionToken = token
        state = .listening(partial: "")
        showOverlay()
        return token
    }

    func updatePartial(_ text: String, token: UUID) {
        guard token == sessionToken else { return }
        state = .listening(partial: text)
        updateOverlayContent()
    }

    func presentFinal(_ text: String, token: UUID) {
        guard token == sessionToken else { return }
        state = .captured(text: text)
        updateOverlayContent()

        // Auto-send after 2 seconds
        Task {
            try? await Task.sleep(for: .seconds(2))
            guard self.sessionToken == token else { return }
            await self.send(token: token)
        }
    }

    func send(token: UUID) async {
        guard token == sessionToken else { return }
        guard case .captured(let text) = state else { return }
        state = .sending
        updateOverlayContent()

        await VoiceWakeForwarder.shared.forward(text: text)
        dismiss(token: token)
    }

    func dismiss(token: UUID) {
        guard token == sessionToken else { return }
        sessionToken = nil
        state = .idle

        guard let window else { return }
        NSAnimationContext.runAnimationGroup({ context in
            context.duration = 0.18
            context.timingFunction = CAMediaTimingFunction(name: .easeOut)
            window.animator().alphaValue = 0
        }, completionHandler: { [weak self] in
            self?.window?.orderOut(nil)
            self?.window?.alphaValue = 1
        })
    }

    // MARK: - Window

    private func showOverlay() {
        if window == nil {
            let view = VoiceWakeOverlayView()
            let hostingView = NSHostingView(rootView: view)
            let win = NSPanel(
                contentRect: NSRect(x: 0, y: 0, width: 340, height: 120),
                styleMask: [.nonactivatingPanel, .titled, .fullSizeContentView],
                backing: .buffered,
                defer: false
            )
            win.titlebarAppearsTransparent = true
            win.titleVisibility = .hidden
            win.isMovableByWindowBackground = true
            win.level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.popUpMenuWindow)) - 4)
            win.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
            win.isReleasedWhenClosed = false
            win.backgroundColor = .clear
            win.contentView = hostingView
            window = win
        }

        // Position at top-center of screen
        if let screen = NSScreen.main {
            let screenFrame = screen.visibleFrame
            let x = screenFrame.midX - 170
            let y = screenFrame.maxY - 140
            window?.setFrameOrigin(NSPoint(x: x, y: y))
        }

        window?.alphaValue = 1
        window?.makeKeyAndOrderFront(nil)
    }

    private func updateOverlayContent() {
        // SwiftUI view observes state changes via NotificationCenter
        NotificationCenter.default.post(name: .voiceOverlayStateChanged, object: nil)
    }
}

extension Notification.Name {
    static let voiceOverlayStateChanged = Notification.Name("voiceOverlayStateChanged")
}

// MARK: - Overlay View

struct VoiceWakeOverlayView: View {
    @State private var text = ""
    @State private var isSending = false

    var body: some View {
        VStack(spacing: 12) {
            HStack {
                Image(systemName: isSending ? "arrow.up.circle.fill" : "waveform")
                    .font(.title2)
                    .foregroundStyle(isSending ? .blue : .green)

                VStack(alignment: .leading, spacing: 2) {
                    Text(isSending ? "Sending..." : "Listening...")
                        .font(.caption.bold())
                        .foregroundStyle(.secondary)
                    Text(text.isEmpty ? "Say something..." : text)
                        .font(.body)
                        .lineLimit(3)
                }

                Spacer()

                Button {
                    let controller = VoiceWakeOverlayController.shared
                    if let token = controller.sessionToken {
                        controller.dismiss(token: token)
                    }
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(16)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
        .onReceive(NotificationCenter.default.publisher(for: .voiceOverlayStateChanged)) { _ in
            updateFromController()
        }
        .onAppear { updateFromController() }
    }

    private func updateFromController() {
        let controller = VoiceWakeOverlayController.shared
        switch controller.state {
        case .idle:
            text = ""
            isSending = false
        case .listening(let partial):
            text = partial
            isSending = false
        case .captured(let captured):
            text = captured
            isSending = false
        case .sending:
            isSending = true
        }
    }
}

// MARK: - Talk Mode Overlay

struct TalkModeOverlayView: View {
    @State private var phase = "idle"
    @State private var transcript = ""
    @State private var response = ""
    @State private var micLevel: Float = 0

    var body: some View {
        VStack(spacing: 16) {
            // Phase indicator
            HStack {
                phaseIcon
                    .font(.title)
                    .foregroundStyle(phaseColor)

                VStack(alignment: .leading) {
                    Text(phaseLabel)
                        .font(.headline)
                    if !transcript.isEmpty {
                        Text(transcript)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                    }
                }

                Spacer()

                Button("Stop") {
                    Task { await TalkModeRuntime.shared.stop() }
                }
                .buttonStyle(.bordered)
            }

            // Mic level bar
            if phase == "listening" {
                MicLevelBar()
                    .frame(height: 8)
            }

            // Response
            if !response.isEmpty {
                Text(response)
                    .font(.body)
                    .lineLimit(5)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(20)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
        .frame(width: 400)
    }

    private var phaseIcon: Image {
        switch phase {
        case "listening": return Image(systemName: "mic.fill")
        case "thinking": return Image(systemName: "brain")
        case "speaking": return Image(systemName: "speaker.wave.3.fill")
        default: return Image(systemName: "circle")
        }
    }

    private var phaseColor: Color {
        switch phase {
        case "listening": return .green
        case "thinking": return .orange
        case "speaking": return .blue
        default: return .secondary
        }
    }

    private var phaseLabel: String {
        switch phase {
        case "listening": return "Listening..."
        case "thinking": return "Thinking..."
        case "speaking": return "Speaking..."
        default: return "Talk Mode"
        }
    }
}
