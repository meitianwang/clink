import Foundation

/// Resolves paths under ~/.klaus/ used by both the daemon and the macOS app.
enum KlausPaths {
    static let configDir: String = {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        return "\(home)/.klaus"
    }()

    static let configFile = "\(configDir)/config.yaml"
    static let pidFile = "\(configDir)/klaus.pid"
    static let logDir = "\(configDir)/logs"
    static let logFile = "\(logDir)/klaus.log"
    static let dbFile = "\(configDir)/klaus.db"
    static let localTokenFile = "\(configDir)/local.token"
    static let execTokenFile = "\(configDir)/exec.token"
    static let execSocket = "\(configDir)/exec.sock"
    static let canvasDir = "\(configDir)/canvas"

    static let launchAgentsDir: String = {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        return "\(home)/Library/LaunchAgents"
    }()

    static let launchAgentPlist = "\(launchAgentsDir)/ai.klaus.daemon.plist"
}
