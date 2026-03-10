import Speech
import AVFoundation

/// Speech-to-text service using Apple's Speech framework.
/// Long-press to record, release to stop. Transcript persists after stop.
@MainActor
final class SpeechRecognizer: NSObject, ObservableObject {
    @Published var transcript = ""
    @Published var isRecording = false
    @Published var error: String?

    private let speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: "zh-Hans"))
    private let audioEngine = AVAudioEngine()
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?

    override init() {
        super.init()
        speechRecognizer?.delegate = self
    }

    // MARK: - Public

    func startRecording() {
        Task { await beginRecording() }
    }

    func stopRecording() {
        guard audioEngine.isRunning else {
            isRecording = false
            return
        }
        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        recognitionRequest?.endAudio()
        recognitionRequest = nil
        // Don't cancel the task — let it finalize the last result
        recognitionTask = nil
        isRecording = false

        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    // MARK: - Private

    private func beginRecording() async {
        transcript = ""
        error = nil

        let speechStatus = await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                continuation.resume(returning: status)
            }
        }
        guard speechStatus == .authorized else {
            error = L10n.speechPermissionDenied
            return
        }

        let audioStatus = await withCheckedContinuation { continuation in
            AVAudioSession.sharedInstance().requestRecordPermission { granted in
                continuation.resume(returning: granted)
            }
        }
        guard audioStatus else {
            error = L10n.micPermissionDenied
            return
        }

        guard let speechRecognizer, speechRecognizer.isAvailable else {
            error = L10n.speechNotAvailable
            return
        }

        recognitionTask?.cancel()
        recognitionTask = nil

        do {
            let audioSession = AVAudioSession.sharedInstance()
            try audioSession.setCategory(.record, mode: .measurement, options: .duckOthers)
            try audioSession.setActive(true, options: .notifyOthersOnDeactivation)

            let request = SFSpeechAudioBufferRecognitionRequest()
            request.shouldReportPartialResults = true
            recognitionRequest = request

            recognitionTask = speechRecognizer.recognitionTask(with: request) { [weak self] result, error in
                Task { @MainActor in
                    guard let self else { return }
                    if let result {
                        self.transcript = result.bestTranscription.formattedString
                    }
                    if error != nil || result?.isFinal == true {
                        // Only stop engine, don't clear transcript
                        if self.audioEngine.isRunning {
                            self.audioEngine.stop()
                            self.audioEngine.inputNode.removeTap(onBus: 0)
                        }
                        self.recognitionRequest = nil
                        self.recognitionTask = nil
                        self.isRecording = false
                        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
                    }
                }
            }

            let inputNode = audioEngine.inputNode
            let format = inputNode.outputFormat(forBus: 0)
            inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
                self?.recognitionRequest?.append(buffer)
            }

            audioEngine.prepare()
            try audioEngine.start()
            isRecording = true
        } catch {
            self.error = error.localizedDescription
            stopRecording()
        }
    }
}

// MARK: - SFSpeechRecognizerDelegate

extension SpeechRecognizer: SFSpeechRecognizerDelegate {
    nonisolated func speechRecognizer(_ speechRecognizer: SFSpeechRecognizer, availabilityDidChange available: Bool) {
        Task { @MainActor in
            if !available && isRecording {
                stopRecording()
                error = L10n.speechNotAvailable
            }
        }
    }
}
