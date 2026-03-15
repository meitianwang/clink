import Foundation
import Sparkle
import SwiftUI

/// Sparkle auto-update controller for the Klaus macOS app.
@MainActor
final class SparkleUpdater {
    static let shared = SparkleUpdater()

    let updaterController: SPUStandardUpdaterController

    private init() {
        updaterController = SPUStandardUpdaterController(
            startingUpdater: true,
            updaterDelegate: nil,
            userDriverDelegate: nil
        )
    }

    func checkForUpdates() {
        updaterController.checkForUpdates(nil)
    }

    var canCheckForUpdates: Bool {
        updaterController.updater.canCheckForUpdates
    }
}

/// SwiftUI view for the "Check for Updates" button in settings.
struct CheckForUpdatesView: View {
    @State private var canCheck = false

    var body: some View {
        Button("Check for Updates…") {
            SparkleUpdater.shared.checkForUpdates()
        }
        .disabled(!canCheck)
        .onAppear {
            canCheck = SparkleUpdater.shared.canCheckForUpdates
        }
    }
}
