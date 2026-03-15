import AppKit
import Foundation
import Observation

/// Centralized app state, persisted to UserDefaults.
@MainActor
@Observable
final class AppState {
    static let shared = AppState()

    // MARK: - Daemon

    var isPaused: Bool {
        didSet { UserDefaults.standard.set(isPaused, forKey: pauseEnabledKey) }
    }

    // MARK: - UI

    var showDockIcon: Bool {
        didSet {
            UserDefaults.standard.set(showDockIcon, forKey: showDockIconKey)
            applyDockIconVisibility()
        }
    }

    var onboardingSeen: Bool {
        didSet { UserDefaults.standard.set(onboardingSeen, forKey: onboardingSeenKey) }
    }

    var debugPaneEnabled: Bool {
        didSet { UserDefaults.standard.set(debugPaneEnabled, forKey: debugPaneEnabledKey) }
    }

    // MARK: - Features

    var voiceWakeEnabled: Bool {
        didSet { UserDefaults.standard.set(voiceWakeEnabled, forKey: voiceWakeEnabledKey) }
    }

    var talkEnabled: Bool {
        didSet { UserDefaults.standard.set(talkEnabled, forKey: talkEnabledKey) }
    }

    var canvasEnabled: Bool {
        didSet { UserDefaults.standard.set(canvasEnabled, forKey: canvasEnabledKey) }
    }

    // MARK: - Runtime (not persisted)

    var isWorking = false
    var daemonVersion: String?

    // MARK: - Init

    private init() {
        let defaults = UserDefaults.standard
        self.isPaused = defaults.bool(forKey: pauseEnabledKey)
        self.showDockIcon = defaults.bool(forKey: showDockIconKey)
        self.onboardingSeen = defaults.bool(forKey: onboardingSeenKey)
        self.debugPaneEnabled = defaults.bool(forKey: debugPaneEnabledKey)
        self.voiceWakeEnabled = defaults.bool(forKey: voiceWakeEnabledKey)
        self.talkEnabled = defaults.bool(forKey: talkEnabledKey)
        self.canvasEnabled = defaults.bool(forKey: canvasEnabledKey)
    }

    private func applyDockIconVisibility() {
        if showDockIcon {
            NSApplication.shared.setActivationPolicy(.regular)
        } else {
            NSApplication.shared.setActivationPolicy(.accessory)
        }
    }
}
