import AVFoundation
import AppKit
import Foundation
import OSLog
import Speech
import UserNotifications
import KlausIPC

/// Manages macOS TCC permission checks and requests.
@MainActor
final class PermissionManager {
    static let shared = PermissionManager()

    private let logger = Logger(subsystem: "ai.klaus", category: "permissions")

    enum PermissionStatus: Sendable {
        case granted
        case denied
        case notDetermined
        case restricted
    }

    // MARK: - Check

    func check(_ capability: Capability) -> PermissionStatus {
        switch capability {
        case .notifications:
            return checkNotifications()
        case .accessibility:
            return AXIsProcessTrusted() ? .granted : .denied
        case .screenRecording:
            return checkScreenRecording()
        case .microphone:
            return mapAVStatus(AVCaptureDevice.authorizationStatus(for: .audio))
        case .speechRecognition:
            return mapSpeechStatus(SFSpeechRecognizer.authorizationStatus())
        case .camera:
            return mapAVStatus(AVCaptureDevice.authorizationStatus(for: .video))
        }
    }

    // MARK: - Request

    func request(_ capability: Capability) async -> PermissionStatus {
        switch capability {
        case .notifications:
            return await requestNotifications()
        case .accessibility:
            requestAccessibility()
            return check(Capability.accessibility)
        case .screenRecording:
            requestScreenRecording()
            return check(Capability.screenRecording)
        case .microphone:
            let granted = await AVCaptureDevice.requestAccess(for: .audio)
            return granted ? .granted : .denied
        case .speechRecognition:
            return await requestSpeechRecognition()
        case .camera:
            let granted = await AVCaptureDevice.requestAccess(for: .video)
            return granted ? .granted : .denied
        }
    }

    /// Ensure multiple capabilities are granted, requesting if needed.
    func ensure(_ capabilities: [Capability], interactive: Bool = true) async -> [Capability: PermissionStatus] {
        var results = [Capability: PermissionStatus]()
        for cap in capabilities {
            let status = check(cap)
            if status == .granted {
                results[cap] = PermissionStatus.granted
            } else if interactive {
                results[cap] = await request(cap)
            } else {
                results[cap] = status
            }
        }
        return results
    }

    /// Check if voice wake permissions (mic + speech) are granted.
    func voiceWakePermissionsGranted() -> Bool {
        check(Capability.microphone) == .granted && check(Capability.speechRecognition) == .granted
    }

    // MARK: - Private

    private func checkNotifications() -> PermissionStatus {
        return .notDetermined
    }

    private func requestNotifications() async -> PermissionStatus {
        do {
            let center = UNUserNotificationCenter.current()
            let authOptions: UNAuthorizationOptions = [.alert, .sound, .badge]
            let granted = try await center.requestAuthorization(options: authOptions)
            return granted ? .granted : .denied
        } catch {
            logger.error("Notification permission error: \(error.localizedDescription)")
            return .denied
        }
    }

    private func checkScreenRecording() -> PermissionStatus {
        return CGPreflightScreenCaptureAccess() ? .granted : .denied
    }

    private func requestScreenRecording() {
        CGRequestScreenCaptureAccess()
    }

    private nonisolated func requestAccessibility() {
        let prompt = "AXTrustedCheckOptionPrompt" as CFString
        let options = [prompt: true] as CFDictionary
        AXIsProcessTrustedWithOptions(options)
    }

    private func requestSpeechRecognition() async -> PermissionStatus {
        return await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                continuation.resume(returning: self.mapSpeechStatus(status))
            }
        }
    }

    private func mapAVStatus(_ status: AVAuthorizationStatus) -> PermissionStatus {
        switch status {
        case .authorized: return .granted
        case .denied: return .denied
        case .restricted: return .restricted
        case .notDetermined: return .notDetermined
        @unknown default: return .notDetermined
        }
    }

    private func mapSpeechStatus(_ status: SFSpeechRecognizerAuthorizationStatus) -> PermissionStatus {
        switch status {
        case .authorized: return .granted
        case .denied: return .denied
        case .restricted: return .restricted
        case .notDetermined: return .notDetermined
        @unknown default: return .notDetermined
        }
    }
}
