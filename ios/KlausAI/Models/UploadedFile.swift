import Foundation
import SwiftUI

/// Represents a file uploaded to the server, shown in the input bar preview.
struct UploadedFile: Identifiable, Sendable {
    let id: String           // Server-assigned file ID
    let name: String         // Display name
    let type: AttachedFile.FileType
    let thumbnail: Data?     // JPEG thumbnail data for images
    let size: Int            // File size in bytes
}
