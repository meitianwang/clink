import AppKit
import Foundation
import OSLog
import SwiftUI
import WebKit

/// Manages Canvas windows for rendering AI-generated HTML/visualizations.
@MainActor
final class CanvasManager {
    static let shared = CanvasManager()

    private let logger = Logger(subsystem: "ai.klaus", category: "canvas")
    private var controllers: [String: CanvasWindowController] = [:]
    var onPanelVisibilityChanged: ((Bool) -> Void)?

    func show(sessionKey: String = "default", htmlPath: String? = nil) {
        let controller: CanvasWindowController
        if let existing = controllers[sessionKey] {
            controller = existing
        } else {
            controller = CanvasWindowController(sessionKey: sessionKey)
            controllers[sessionKey] = controller
        }

        if let path = htmlPath {
            controller.loadFile(path: path)
        }

        controller.window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        onPanelVisibilityChanged?(true)
    }

    func hide(sessionKey: String = "default") {
        controllers[sessionKey]?.window?.orderOut(nil)
        onPanelVisibilityChanged?(false)
    }

    func eval(sessionKey: String = "default", javaScript: String) async -> String? {
        guard let controller = controllers[sessionKey] else { return nil }
        return await controller.eval(javaScript: javaScript)
    }
}

// MARK: - Canvas Window Controller

@MainActor
final class CanvasWindowController: NSWindowController {
    private let sessionKey: String
    private let webView: WKWebView
    private let logger = Logger(subsystem: "ai.klaus", category: "canvas.window")
    private var fileWatcher: DispatchSourceFileSystemObject?

    init(sessionKey: String) {
        self.sessionKey = sessionKey

        let config = WKWebViewConfiguration()
        config.preferences.isElementFullscreenEnabled = true

        // Register custom URL scheme for local file access
        let schemeHandler = CanvasSchemeHandler()
        config.setURLSchemeHandler(schemeHandler, forURLScheme: "klaus-canvas")

        webView = WKWebView(frame: .zero, configuration: config)
        webView.isInspectable = true

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 800, height: 600),
            styleMask: [.titled, .closable, .resizable, .miniaturizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Klaus Canvas — \(sessionKey)"
        window.contentView = webView
        window.center()
        window.isReleasedWhenClosed = false
        window.minSize = NSSize(width: 400, height: 300)

        super.init(window: window)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) not supported")
    }

    func loadFile(path: String) {
        let url = URL(fileURLWithPath: path)
        webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        watchFile(path: path)
    }

    func loadHTML(_ html: String) {
        webView.loadHTMLString(html, baseURL: nil)
    }

    func eval(javaScript: String) async -> String? {
        return try? await webView.evaluateJavaScript(javaScript) as? String
    }

    func snapshot(to path: String) async -> Bool {
        let config = WKSnapshotConfiguration()
        do {
            let image = try await webView.takeSnapshot(configuration: config)
            guard let tiffData = image.tiffRepresentation,
                  let bitmap = NSBitmapImageRep(data: tiffData),
                  let pngData = bitmap.representation(using: .png, properties: [:]) else {
                return false
            }
            try pngData.write(to: URL(fileURLWithPath: path))
            return true
        } catch {
            logger.error("Snapshot failed: \(error.localizedDescription)")
            return false
        }
    }

    // MARK: - File Watching

    private func watchFile(path: String) {
        fileWatcher?.cancel()

        let fd = open(path, O_EVTONLY)
        guard fd >= 0 else { return }

        let source = DispatchSource.makeFileSystemObjectSource(
            fileDescriptor: fd,
            eventMask: .write,
            queue: .main
        )

        source.setEventHandler { [weak self] in
            self?.webView.reload()
        }

        source.setCancelHandler {
            Darwin.close(fd)
        }

        source.resume()
        fileWatcher = source
    }

    deinit {
        fileWatcher?.cancel()
    }
}

// MARK: - Canvas URL Scheme Handler

/// Handles `klaus-canvas://` URLs for serving local files to the canvas WebView.
final class CanvasSchemeHandler: NSObject, WKURLSchemeHandler {
    func webView(_ webView: WKWebView, start urlSchemeTask: any WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url,
              let path = url.host.map({ "\(KlausPaths.canvasDir)/\($0)\(url.path)" }) else {
            urlSchemeTask.didFailWithError(URLError(.badURL))
            return
        }

        guard FileManager.default.fileExists(atPath: path),
              let data = try? Data(contentsOf: URL(fileURLWithPath: path)) else {
            urlSchemeTask.didFailWithError(URLError(.fileDoesNotExist))
            return
        }

        let mimeType = guessMimeType(for: path)
        let response = URLResponse(
            url: url,
            mimeType: mimeType,
            expectedContentLength: data.count,
            textEncodingName: nil
        )

        urlSchemeTask.didReceive(response)
        urlSchemeTask.didReceive(data)
        urlSchemeTask.didFinish()
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: any WKURLSchemeTask) {
        // No-op
    }

    private func guessMimeType(for path: String) -> String {
        let ext = (path as NSString).pathExtension.lowercased()
        switch ext {
        case "html", "htm": return "text/html"
        case "css": return "text/css"
        case "js": return "application/javascript"
        case "json": return "application/json"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "svg": return "image/svg+xml"
        case "gif": return "image/gif"
        default: return "application/octet-stream"
        }
    }
}
