import Foundation

// MARK: - Identifiers

let appBundleId = "ai.klaus.mac"
let daemonLaunchdLabel = "ai.klaus.daemon"

// MARK: - Defaults Keys

let pauseEnabledKey = "klaus.pauseEnabled"
let showDockIconKey = "klaus.showDockIcon"
let onboardingSeenKey = "klaus.onboardingSeen"
let debugPaneEnabledKey = "klaus.debugPaneEnabled"
let voiceWakeEnabledKey = "klaus.voiceWakeEnabled"
let talkEnabledKey = "klaus.talkEnabled"
let canvasEnabledKey = "klaus.canvasEnabled"

// MARK: - Networking

let defaultDaemonPort = 3000
let healthCheckTimeoutSeconds: TimeInterval = 5

// MARK: - Voice Wake

let defaultVoiceWakeTriggers = ["klaus"]
let voiceWakeMaxWords = 32
