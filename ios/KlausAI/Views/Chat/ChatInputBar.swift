import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

/// Chat input bar with text field, multi-file upload (photos + documents), preview, and send.
struct ChatInputBar: View {
    @ObservedObject var viewModel: ChatViewModel
    @State private var selectedPhotoItems: [PhotosPickerItem] = []
    @State private var showDocumentPicker = false
    @State private var isUploading = false
    @StateObject private var speech = SpeechRecognizer()
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

            // Input container
            HStack(alignment: .center, spacing: 12) {
                // Attachment menu
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
                    Image(systemName: "plus")
                        .font(.system(size: 20, weight: .regular))
                        .foregroundStyle(.secondary)
                        .frame(width: 36, height: 36)
                        .contentShape(Rectangle())
                }
                .onChange(of: selectedPhotoItems) { newItems in
                    guard !newItems.isEmpty else { return }
                    Task {
                        for item in newItems {
                            await handlePhotoSelection(item)
                        }
                        selectedPhotoItems = []
                    }
                }

                // Text input
                TextField(L10n.askKlaus, text: $viewModel.inputText, axis: .vertical)
                    .textFieldStyle(.plain)
                    .lineLimit(1...6)
                    .focused($isFocused)
                    .font(.system(.body, design: .default))
                    .padding(.vertical, 10)
                    .onSubmit {
                        if !viewModel.isProcessing {
                            Task { await viewModel.sendMessage() }
                        }
                    }

                // Send button or action icons
                if canSend && !speech.isRecording {
                    Button {
                        Task { await viewModel.sendMessage() }
                    } label: {
                        ZStack {
                            Circle()
                                .fill(Color.primary)
                                .frame(width: 32, height: 32)

                            Image(systemName: "arrow.up")
                                .font(.system(size: 14, weight: .bold))
                                .foregroundStyle(Color(.systemBackground))
                        }
                    }
                    .padding(.bottom, 6)
                    .padding(.trailing, 6)
                } else {
                    HStack(spacing: 16) {
                        Image(systemName: speech.isRecording ? "mic.fill" : "mic")
                            .font(.system(size: 20))
                            .foregroundStyle(speech.isRecording ? .red : .secondary)
                            .gesture(
                                LongPressGesture(minimumDuration: 0.15)
                                    .onEnded { _ in
                                        speech.startRecording()
                                        HapticManager.impact(.medium)
                                    }
                                    .sequenced(before: DragGesture(minimumDistance: 0)
                                        .onEnded { _ in
                                            if speech.isRecording {
                                                speech.stopRecording()
                                                HapticManager.impact(.light)
                                            }
                                        }
                                    )
                            )

                        Image(systemName: "sparkles")
                            .font(.system(size: 20))
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 10)
                    .padding(.trailing, 10)
                }
            }
            .padding(.leading, 8)
            .padding(.trailing, 4)
            .background(Color(.systemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .stroke(Color(.systemGray4), lineWidth: 1)
            )
            .padding(.horizontal, 16)
            .padding(.bottom, 8)
            .padding(.top, 4)
        }
        .background(Color(.systemGroupedBackground))
        .sheet(isPresented: $showDocumentPicker) {
            DocumentPickerView { urls in
                Task {
                    for url in urls {
                        await handleDocumentSelection(url)
                    }
                }
            }
        }
        .onChange(of: speech.transcript) { newValue in
            viewModel.inputText = newValue
        }
        .onChange(of: speech.error) { newValue in
            if let msg = newValue {
                viewModel.errorMessage = msg
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
            var thumbnail: Data?
            if mimeType.hasPrefix("image/") && data.count < 100_000 {
                thumbnail = data
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
