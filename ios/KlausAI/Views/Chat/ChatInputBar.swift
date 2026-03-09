import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

/// Chat input bar with text field, multi-file upload (photos + documents), preview, and send.
struct ChatInputBar: View {
    @Bindable var viewModel: ChatViewModel
    @State private var selectedPhotoItems: [PhotosPickerItem] = []
    @State private var showDocumentPicker = false
    @State private var isUploading = false
    @FocusState private var isFocused: Bool

    private static let maxFileSize = 10 * 1024 * 1024  // 10 MB

    var body: some View {
        VStack(spacing: 0) {
            // Upload preview strip
            if !viewModel.uploadedFiles.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(viewModel.uploadedFiles) { file in
                            UploadPreviewChip(file: file) {
                                viewModel.removeUploadedFile(file)
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 6)
                }
            }

            // Upload progress
            if isUploading {
                HStack(spacing: 6) {
                    ProgressView()
                        .controlSize(.small)
                    Text("上传中...")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 4)
            }

            HStack(alignment: .bottom, spacing: 8) {
                // Attachment menu (photos + documents)
                Menu {
                    PhotosPicker(selection: $selectedPhotoItems, matching: .any(of: [.images, .videos])) {
                        Label("照片与视频", systemImage: "photo.on.rectangle")
                    }

                    Button {
                        showDocumentPicker = true
                    } label: {
                        Label("文件", systemImage: "doc")
                    }
                } label: {
                    Image(systemName: "plus.circle.fill")
                        .font(.title2)
                        .foregroundStyle(.secondary)
                }
                .onChange(of: selectedPhotoItems) { _, newItems in
                    guard !newItems.isEmpty else { return }
                    Task {
                        for item in newItems {
                            await handlePhotoSelection(item)
                        }
                        selectedPhotoItems = []
                    }
                }

                // Text input
                TextField(L10n.messagePlaceholder, text: $viewModel.inputText, axis: .vertical)
                    .textFieldStyle(.plain)
                    .lineLimit(1...6)
                    .focused($isFocused)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color(.systemGray6))
                    .clipShape(RoundedRectangle(cornerRadius: 20))
                    .onSubmit {
                        if !viewModel.isProcessing {
                            Task { await viewModel.sendMessage() }
                        }
                    }

                // Send button
                Button {
                    Task { await viewModel.sendMessage() }
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.title2)
                        .foregroundStyle(canSend ? .accent : .secondary)
                }
                .disabled(!canSend)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
        .background(.bar)
        .sheet(isPresented: $showDocumentPicker) {
            DocumentPickerView { urls in
                Task {
                    for url in urls {
                        await handleDocumentSelection(url)
                    }
                }
            }
        }
    }

    private var canSend: Bool {
        let hasText = !viewModel.inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        return (hasText || !viewModel.uploadedFiles.isEmpty) && !viewModel.isProcessing && !isUploading
    }

    private func handlePhotoSelection(_ item: PhotosPickerItem) async {
        guard let data = try? await item.loadTransferable(type: Data.self) else { return }

        guard data.count <= Self.maxFileSize else {
            viewModel.errorMessage = "文件超过 10 MB 限制"
            return
        }

        let contentType = item.supportedContentTypes.first
        let mimeType = contentType?.preferredMIMEType ?? "image/jpeg"
        let ext = contentType?.preferredFilenameExtension ?? "jpg"
        let fileName = "photo.\(ext)"

        isUploading = true
        do {
            let response = try await viewModel.appState.api.uploadFile(
                data: data,
                fileName: fileName,
                contentType: mimeType
            )
            let thumbnail: Data? = if mimeType.hasPrefix("image/") && data.count < 100_000 {
                data
            } else {
                nil
            }
            viewModel.uploadedFiles.append(UploadedFile(
                id: response.id,
                name: response.name,
                type: AttachedFile.FileType(rawValue: response.type) ?? .file,
                thumbnail: thumbnail,
                size: data.count
            ))
        } catch {
            viewModel.errorMessage = "\(L10n.uploadFailed): \(error.localizedDescription)"
        }
        isUploading = false
    }

    private func handleDocumentSelection(_ url: URL) async {
        guard url.startAccessingSecurityScopedResource() else { return }
        defer { url.stopAccessingSecurityScopedResource() }

        guard let data = try? Data(contentsOf: url) else { return }

        guard data.count <= Self.maxFileSize else {
            viewModel.errorMessage = "文件超过 10 MB 限制"
            return
        }

        let fileName = url.lastPathComponent
        let mimeType = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream"

        isUploading = true
        do {
            let response = try await viewModel.appState.api.uploadFile(
                data: data,
                fileName: fileName,
                contentType: mimeType
            )
            viewModel.uploadedFiles.append(UploadedFile(
                id: response.id,
                name: response.name,
                type: AttachedFile.FileType(rawValue: response.type) ?? .file,
                thumbnail: nil,
                size: data.count
            ))
        } catch {
            viewModel.errorMessage = "\(L10n.uploadFailed): \(error.localizedDescription)"
        }
        isUploading = false
    }
}

// MARK: - Upload preview chip with remove button

private struct UploadPreviewChip: View {
    let file: UploadedFile
    let onRemove: () -> Void

    var body: some View {
        HStack(spacing: 6) {
            if let thumbnailData = file.thumbnail,
               let uiImage = UIImage(data: thumbnailData) {
                Image(uiImage: uiImage)
                    .resizable()
                    .scaledToFill()
                    .frame(width: 28, height: 28)
                    .clipShape(RoundedRectangle(cornerRadius: 4))
            } else {
                Image(systemName: iconForType(file.type))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Text(file.name)
                .font(.caption2)
                .lineLimit(1)
                .frame(maxWidth: 100)

            Button {
                onRemove()
                HapticManager.impact(.light)
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
        .background(Color(.systemGray5))
        .clipShape(Capsule())
    }

    private func iconForType(_ type: AttachedFile.FileType) -> String {
        switch type {
        case .image: return "photo"
        case .audio: return "waveform"
        case .video: return "play.rectangle"
        case .file: return "doc"
        }
    }
}

// MARK: - Document picker wrapper

struct DocumentPickerView: UIViewControllerRepresentable {
    let onPick: ([URL]) -> Void

    func makeUIViewController(context: Context) -> UIDocumentPickerViewController {
        let types: [UTType] = [.image, .audio, .video, .plainText, .pdf, .json, .zip, .gzip]
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: types, asCopy: true)
        picker.allowsMultipleSelection = true
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIDocumentPickerViewController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(onPick: onPick) }

    class Coordinator: NSObject, UIDocumentPickerDelegate {
        let onPick: ([URL]) -> Void
        init(onPick: @escaping ([URL]) -> Void) { self.onPick = onPick }
        func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
            onPick(urls)
        }
    }
}
