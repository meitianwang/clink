import AppKit
import Foundation
import OSLog

/// Watches ~/.klaus/config.yaml for changes and notifies observers.
@MainActor
final class ConfigFileWatcher {
    static let shared = ConfigFileWatcher()

    private let logger = Logger(subsystem: "ai.klaus", category: "config.watcher")
    private var source: DispatchSourceFileSystemObject?
    private var debounceTask: Task<Void, Never>?

    var onChange: (() -> Void)?

    func start() {
        stop()

        let path = KlausPaths.configFile
        guard FileManager.default.fileExists(atPath: path) else {
            logger.info("Config file not found, skipping watcher")
            return
        }

        let fd = open(path, O_EVTONLY)
        guard fd >= 0 else {
            logger.error("Failed to open config file for watching")
            return
        }

        let src = DispatchSource.makeFileSystemObjectSource(
            fileDescriptor: fd,
            eventMask: [.write, .rename, .delete],
            queue: .main
        )

        src.setEventHandler { [weak self] in
            self?.handleChange()
        }

        src.setCancelHandler {
            Darwin.close(fd)
        }

        src.resume()
        source = src
        logger.info("Config file watcher started")
    }

    func stop() {
        source?.cancel()
        source = nil
        debounceTask?.cancel()
        debounceTask = nil
    }

    private func handleChange() {
        // Debounce: wait 500ms before notifying
        debounceTask?.cancel()
        debounceTask = Task {
            try? await Task.sleep(for: .milliseconds(500))
            guard !Task.isCancelled else { return }
            logger.info("Config file changed")
            onChange?()
        }
    }
}

/// Voice Push-to-Talk: hold a key to record, release to send.
@MainActor
final class VoicePushToTalk {
    static let shared = VoicePushToTalk()

    private let logger = Logger(subsystem: "ai.klaus", category: "ptt")
    private var monitor: Any?
    private var isRecording = false

    /// Start monitoring for the push-to-talk hotkey (default: Fn key / Option+Space).
    func start() {
        guard monitor == nil else { return }

        // Monitor for Option+Space as push-to-talk
        monitor = NSEvent.addGlobalMonitorForEvents(matching: [.keyDown, .keyUp]) { [weak self] event in
            guard let self else { return }
            // Option + Space
            let isHotkey = event.modifierFlags.contains(.option) && event.keyCode == 49 // Space

            if isHotkey {
                if event.type == .keyDown && !self.isRecording {
                    self.isRecording = true
                    Task { await VoiceWakeRuntime.shared.start(triggerWords: []) }
                    self.logger.info("PTT: recording started")
                } else if event.type == .keyUp && self.isRecording {
                    self.isRecording = false
                    Task { await VoiceWakeRuntime.shared.stop() }
                    self.logger.info("PTT: recording stopped")
                }
            }
        }

        logger.info("Push-to-talk monitoring started (Option+Space)")
    }

    func stop() {
        if let monitor {
            NSEvent.removeMonitor(monitor)
        }
        monitor = nil
        isRecording = false
    }
}
