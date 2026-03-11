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
    @State private var showVoiceSheet = false
    @State private var showPhotoPicker = false

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
                attachmentMenu

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

                if canSend {
                    sendButton
                } else {
                    Button {
                        isFocused = false
                        showVoiceSheet = true
                    } label: {
                        Image(systemName: "mic")
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
        .sheet(isPresented: $showVoiceSheet) {
            VoiceInputSheet(speech: speech) { text in
                if !text.isEmpty {
                    viewModel.inputText += text
                }
            }
            .presentationDetents([.medium])
            .presentationDragIndicator(.visible)
        }
        .onChange(of: speech.error) { newValue in
            if let msg = newValue {
                viewModel.errorMessage = msg
            }
        }
    }

    // MARK: - Subviews

    private var sendButton: some View {
        Button {
            Task { await viewModel.sendMessage() }
        } label: {
            ZStack {
                Circle()
                    .fill(Color.primary)
                    .frame(width: 32, height: 32)

                Image(systemName: "paperplane.fill")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Color(.systemBackground))
                    .offset(x: -1, y: 1)
            }
        }
        .padding(.bottom, 6)
        .padding(.trailing, 6)
    }

    private var attachmentMenu: some View {
        Menu {
            Button {
                showPhotoPicker = true
            } label: {
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
        .photosPicker(isPresented: $showPhotoPicker, selection: $selectedPhotoItems, matching: .any(of: [.images, .videos]))
        .onChange(of: selectedPhotoItems) { newItems in
            guard !newItems.isEmpty else { return }
            Task {
                for item in newItems {
                    await handlePhotoSelection(item)
                }
                selectedPhotoItems = []
            }
        }
    }

    // MARK: - Computed

    private var canSend: Bool {
        let hasText = !viewModel.inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        return (hasText || !viewModel.uploadedFiles.isEmpty) && !viewModel.isProcessing && !isUploading
    }

    // MARK: - File handling

    private func handlePhotoSelection(_ item: PhotosPickerItem) async {
        let data: Data
        do {
            guard let loaded = try await item.loadTransferable(type: Data.self) else {
                viewModel.errorMessage = "无法加载所选照片"
                return
            }
            data = loaded
        } catch {
            viewModel.errorMessage = "加载照片失败: \(error.localizedDescription)"
            return
        }

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
            if mimeType.hasPrefix("image/") {
                thumbnail = await Task.detached(priority: .utility) {
                    guard let uiImage = UIImage(data: data) else { return nil as Data? }
                    let maxDim: CGFloat = 400
                    let scale = min(maxDim / uiImage.size.width, maxDim / uiImage.size.height, 1.0)
                    if scale >= 1.0 && data.count < 200_000 { return data }
                    let newSize = CGSize(width: uiImage.size.width * scale, height: uiImage.size.height * scale)
                    let renderer = UIGraphicsImageRenderer(size: newSize)
                    let resized = renderer.image { _ in uiImage.draw(in: CGRect(origin: .zero, size: newSize)) }
                    return resized.jpegData(compressionQuality: 0.7)
                }.value
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
        let hasAccess = url.startAccessingSecurityScopedResource()
        defer { if hasAccess { url.stopAccessingSecurityScopedResource() } }

        guard let data = try? Data(contentsOf: url) else {
            viewModel.errorMessage = "无法读取文件"
            return
        }

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

// MARK: - Siri-style voice input sheet

private struct VoiceInputSheet: View {
    @ObservedObject var speech: SpeechRecognizer
    let onFinish: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var pulseScale: CGFloat = 1.0

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            // Transcript
            ScrollView {
                Text(speech.transcript.isEmpty ? "正在聆听..." : speech.transcript)
                    .font(.system(.title3, weight: .medium))
                    .foregroundStyle(speech.transcript.isEmpty ? .secondary : .primary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
                    .frame(maxWidth: .infinity)
            }
            .frame(maxHeight: 120)

            Spacer()

            // Pulsating mic indicator
            ZStack {
                // Outer pulse rings
                if speech.isRecording {
                    Circle()
                        .fill(Color.accentColor.opacity(0.08))
                        .frame(width: 140, height: 140)
                        .scaleEffect(pulseScale)

                    Circle()
                        .fill(Color.accentColor.opacity(0.12))
                        .frame(width: 110, height: 110)
                        .scaleEffect(pulseScale * 0.95)
                }

                // Main circle
                Circle()
                    .fill(speech.isRecording ? Color.accentColor : Color(.systemGray4))
                    .frame(width: 80, height: 80)
                    .shadow(color: speech.isRecording ? Color.accentColor.opacity(0.3) : .clear, radius: 12)

                Image(systemName: "mic.fill")
                    .font(.system(size: 30, weight: .medium))
                    .foregroundStyle(.white)
            }
            .animation(.easeInOut(duration: 0.3), value: speech.isRecording)

            Spacer()

            // Action buttons
            HStack(spacing: 48) {
                // Cancel
                Button {
                    speech.stopRecording()
                    HapticManager.impact(.light)
                    dismiss()
                } label: {
                    VStack(spacing: 6) {
                        ZStack {
                            Circle()
                                .fill(Color(.systemGray5))
                                .frame(width: 52, height: 52)
                            Image(systemName: "xmark")
                                .font(.system(size: 18, weight: .semibold))
                                .foregroundStyle(.secondary)
                        }
                        Text("取消")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                // Done
                Button {
                    let text = speech.transcript
                    speech.stopRecording()
                    HapticManager.impact(.medium)
                    onFinish(text)
                    dismiss()
                } label: {
                    VStack(spacing: 6) {
                        ZStack {
                            Circle()
                                .fill(Color.accentColor)
                                .frame(width: 52, height: 52)
                            Image(systemName: "checkmark")
                                .font(.system(size: 18, weight: .semibold))
                                .foregroundStyle(.white)
                        }
                        Text("完成")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .disabled(speech.transcript.isEmpty)
                .opacity(speech.transcript.isEmpty ? 0.4 : 1.0)
            }
            .padding(.bottom, 40)
        }
        .onAppear {
            speech.startRecording()
            HapticManager.impact(.medium)
            startPulseAnimation()
        }
        .onDisappear {
            if speech.isRecording {
                speech.stopRecording()
            }
        }
    }

    private func startPulseAnimation() {
        withAnimation(
            .easeInOut(duration: 1.5)
            .repeatForever(autoreverses: true)
        ) {
            pulseScale = 1.15
        }
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
