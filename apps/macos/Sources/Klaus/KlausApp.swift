import AppKit
import Foundation
import MenuBarExtraAccess
import OSLog
import SwiftUI

@main
struct KlausApp: App {
    @NSApplicationDelegateAdaptor(KlausAppDelegate.self) private var delegate
    @State private var state = AppState.shared
    private let daemonManager = DaemonProcessManager.shared
    @State private var isMenuPresented = false

    private static let logger = Logger(subsystem: "ai.klaus", category: "app")

    init() {
        DaemonEnvironment.shared.refresh()
    }

    var body: some Scene {
        MenuBarExtra {
            MenuContentView(state: state, daemonManager: daemonManager)
        } label: {
            AnimatedStatusIcon(
                status: daemonManager.status,
                isPaused: state.isPaused,
                isWorking: state.isWorking
            )
        }
        .menuBarExtraStyle(.menu)
        .menuBarExtraAccess(isPresented: $isMenuPresented)
        .onChange(of: state.isPaused) { _, paused in
            daemonManager.setActive(!paused)
        }

        Settings {
            SettingsRootView(state: state)
                .frame(width: 600, height: 520)
        }
    }
}

// MARK: - App Delegate

final class KlausAppDelegate: NSObject, NSApplicationDelegate {
    private static let logger = Logger(subsystem: "ai.klaus", category: "delegate")

    func applicationDidFinishLaunching(_ notification: Notification) {
        if !AppState.shared.showDockIcon {
            NSApplication.shared.setActivationPolicy(.accessory)
        }

        if !AppState.shared.isPaused {
            DaemonProcessManager.shared.start()
        }

        // Start all subsystems
        ControlChannel.shared.start()
        ExecApprovalsSocket.shared.start()
        HeartbeatStore.shared.start()
        CanvasA2UIBridge.shared.startListening()
        OnboardingController.shared.showIfNeeded()

        // Refresh usage on launch
        Task { await UsageCostStore.shared.refresh() }

        // Start voice wake if enabled
        if AppState.shared.voiceWakeEnabled {
            Task {
                await VoiceWakeRuntime.shared.start()
            }
        }

        Self.logger.info("Klaus macOS app launched")
    }

    func applicationWillTerminate(_ notification: Notification) {
        ControlChannel.shared.stop()
        ExecApprovalsSocket.shared.stop()
        HeartbeatStore.shared.stop()
        Task { await VoiceWakeRuntime.shared.stop() }
        Self.logger.info("Klaus macOS app terminating")
    }

    func application(_ application: NSApplication, open urls: [URL]) {
        for url in urls {
            DeepLinkHandler.shared.handle(url: url)
        }
    }
}
