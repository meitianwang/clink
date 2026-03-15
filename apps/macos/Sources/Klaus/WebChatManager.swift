import AppKit
import SwiftUI
import WebKit

/// Manages the Web Chat panel/window lifecycle.
@MainActor
final class WebChatManager {
    static let shared = WebChatManager()

    private var panel: WebChatPanel?
    var onPanelVisibilityChanged: ((Bool) -> Void)?

    func toggle(anchorFrame: NSRect? = nil) {
        if let panel, panel.isVisible {
            hide()
        } else {
            show(anchorFrame: anchorFrame)
        }
    }

    func show(anchorFrame: NSRect? = nil) {
        if panel == nil {
            panel = WebChatPanel()
        }
        guard let panel else { return }

        // Position below the menu bar icon if anchor provided
        if let anchor = anchorFrame {
            let panelSize = NSSize(width: 420, height: 640)
            let x = anchor.midX - panelSize.width / 2
            let y = anchor.minY - panelSize.height - 4
            panel.setFrame(NSRect(origin: NSPoint(x: x, y: y), size: panelSize), display: true)
        }

        panel.loadChat()
        panel.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        onPanelVisibilityChanged?(true)
    }

    func hide() {
        panel?.orderOut(nil)
        onPanelVisibilityChanged?(false)
    }

    var isVisible: Bool {
        panel?.isVisible ?? false
    }
}

// MARK: - Chat Panel (NSPanel)

final class WebChatPanel: NSPanel {
    private let webView: WKWebView
    private var hasLoaded = false

    init() {
        let config = WKWebViewConfiguration()
        config.preferences.isElementFullscreenEnabled = true
        // Allow local storage
        config.websiteDataStore = .default()

        webView = WKWebView(frame: .zero, configuration: config)
        webView.isInspectable = true

        super.init(
            contentRect: NSRect(x: 0, y: 0, width: 420, height: 640),
            styleMask: [.titled, .closable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )

        title = "Klaus Chat"
        titlebarAppearsTransparent = true
        titleVisibility = .hidden
        isMovableByWindowBackground = true
        level = .floating
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        isReleasedWhenClosed = false
        minSize = NSSize(width: 320, height: 400)

        contentView = webView
    }

    func loadChat() {
        guard !hasLoaded else { return }
        hasLoaded = true

        // Read local token for cookie-free auth
        let token = readLocalToken() ?? ""
        let port = defaultDaemonPort
        let urlString = "http://localhost:\(port)/?local_token=\(token)"

        if let url = URL(string: urlString) {
            let request = URLRequest(url: url)
            webView.load(request)
        }
    }

    func reload() {
        hasLoaded = false
        loadChat()
    }

    private func readLocalToken() -> String? {
        let path = KlausPaths.localTokenFile
        guard FileManager.default.fileExists(atPath: path),
              let content = try? String(contentsOfFile: path, encoding: .utf8) else {
            return nil
        }
        return content.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    override func close() {
        orderOut(nil)
        WebChatManager.shared.onPanelVisibilityChanged?(false)
    }
}
