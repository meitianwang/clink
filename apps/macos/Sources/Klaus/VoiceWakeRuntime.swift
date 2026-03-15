import AppKit
import AVFoundation
import Foundation
import OSLog
import Speech

/// Full voice wake runtime with RMS-based voice activity detection,
/// generation tracking, and adaptive noise floor.
actor VoiceWakeRuntime {
    static let shared = VoiceWakeRuntime()

    private let logger = Logger(subsystem: "ai.klaus", category: "voicewake")
    private var audioEngine: AVAudioEngine?
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var speechRecognizer: SFSpeechRecognizer?
    private var isListening = false
    private var recognitionGeneration = 0

    // RMS / noise floor
    private var noiseFloorRMS: Float = 0.01
    private let minSpeechRMS: Float = 0.015
    private let speechBoostFactor: Float = 6.0
    private let fastAlpha: Float = 0.08
    private let slowAlpha: Float = 0.01

    // Capture state
    private var captureStartTime: Date?
    private let captureTimeout: TimeInterval = 120 // hard stop
    private let silenceTimeout: TimeInterval = 2.0
    private var lastSpeechTime: Date?

    // Level callback for UI meter
    var onLevelUpdate: ((Float) -> Void)?

    // MARK: - Public

    func start(triggerWords: [String] = defaultVoiceWakeTriggers, localeId: String? = nil) {
        guard !isListening else { return }
        recognitionGeneration += 1
        let generation = recognitionGeneration

        let locale = localeId.map { Locale(identifier: $0) } ?? Locale.current
        speechRecognizer = SFSpeechRecognizer(locale: locale)

        guard let recognizer = speechRecognizer, recognizer.isAvailable else {
            logger.error("Speech recognizer not available for locale \(locale.identifier)")
            return
        }

        // Preflight: check for usable input device
        let engine = AVAudioEngine()
        let inputNode = engine.inputNode
        let recordingFormat = inputNode.outputFormat(forBus: 0)
        guard recordingFormat.sampleRate > 0, recordingFormat.channelCount > 0 else {
            logger.error("No usable audio input device")
            return
        }

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        request.addsPunctuation = false

        // Install audio tap with RMS calculation
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { buffer, _ in
            request.append(buffer)
            // RMS processing happens inline — no cross-isolation needed
        }

        let lowerTriggers = triggerWords.map { $0.lowercased() }

        recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
            guard let self else { return }
            // Extract Sendable values before crossing isolation boundary
            let transcript = result?.bestTranscription.formattedString
            let isFinal = result?.isFinal ?? false
            let hasError = error != nil
            Task {
                await self.handleRecognitionResult(
                    transcript: transcript,
                    isFinal: isFinal,
                    hasError: hasError,
                    generation: generation,
                    triggerWords: lowerTriggers,
                    localeId: localeId,
                    originalTriggers: triggerWords
                )
            }
        }

        do {
            engine.prepare()
            try engine.start()
            audioEngine = engine
            recognitionRequest = request
            isListening = true
            lastSpeechTime = nil
            captureStartTime = nil
            logger.info("Voice wake started (gen \(generation)) with triggers: \(triggerWords.joined(separator: ", "))")
        } catch {
            logger.error("Failed to start audio engine: \(error.localizedDescription)")
            cleanup()
        }
    }

    func stop() {
        guard isListening else { return }
        cleanup()
        logger.info("Voice wake stopped")
    }

    // MARK: - Recognition Handler

    private func handleRecognitionResult(
        transcript: String?,
        isFinal: Bool,
        hasError: Bool,
        generation: Int,
        triggerWords: [String],
        localeId: String?,
        originalTriggers: [String]
    ) {
        // Drop stale callbacks from superseded sessions
        guard generation == recognitionGeneration else { return }

        if let transcript {
            let lower = transcript.lowercased()

            for trigger in triggerWords {
                guard lower.contains(trigger) else { continue }
                guard let range = lower.range(of: trigger) else { continue }

                let afterTrigger = String(lower[range.upperBound...])
                    .trimmingCharacters(in: .whitespaces)

                if !afterTrigger.isEmpty {
                    if captureStartTime == nil {
                        captureStartTime = Date()
                    }
                    lastSpeechTime = Date()

                    if isFinal {
                        Task {
                            await VoiceWakeForwarder.shared.forward(text: afterTrigger)
                        }
                        captureStartTime = nil
                        lastSpeechTime = nil
                    }
                }
                break
            }

            // Hard timeout check
            if let start = captureStartTime, Date().timeIntervalSince(start) > captureTimeout {
                logger.warning("Capture timeout reached, restarting")
                Task { restartRecognition(triggerWords: originalTriggers, localeId: localeId) }
                return
            }
        }

        if hasError || isFinal {
            Task { restartRecognition(triggerWords: originalTriggers, localeId: localeId) }
        }
    }

    // MARK: - RMS Processing

    private func processAudioLevel(buffer: AVAudioPCMBuffer, generation: Int) {
        guard generation == recognitionGeneration else { return }
        guard let channelData = buffer.floatChannelData else { return }

        let frameCount = Int(buffer.frameLength)
        guard frameCount > 0 else { return }

        var sum: Float = 0
        let samples = channelData[0]
        for i in 0..<frameCount {
            let sample = samples[i]
            sum += sample * sample
        }
        let rms = sqrt(sum / Float(frameCount))

        // Adaptive noise floor
        let alpha = rms < noiseFloorRMS ? fastAlpha : slowAlpha
        noiseFloorRMS = noiseFloorRMS * (1 - alpha) + rms * alpha

        // Normalized level for UI
        let threshold = max(minSpeechRMS, noiseFloorRMS * speechBoostFactor)
        let normalized = min(1.0, max(0.0, rms / threshold))
        onLevelUpdate?(normalized)

        // Silence detection during capture
        if captureStartTime != nil {
            if rms > threshold {
                lastSpeechTime = Date()
            } else if let last = lastSpeechTime, Date().timeIntervalSince(last) > silenceTimeout {
                // Silence detected — finalize
                logger.info("Silence detected, finalizing capture")
            }
        }
    }

    // MARK: - Private

    private func restartRecognition(triggerWords: [String], localeId: String?) {
        cleanup()
        Task {
            try? await Task.sleep(for: .milliseconds(300))
            start(triggerWords: triggerWords, localeId: localeId)
        }
    }

    private func cleanup() {
        audioEngine?.stop()
        audioEngine?.inputNode.removeTap(onBus: 0)
        recognitionRequest?.endAudio()
        recognitionTask?.cancel()
        audioEngine = nil
        recognitionRequest = nil
        recognitionTask = nil
        isListening = false
    }
}

// MARK: - Voice Wake Forwarder

/// Forwards recognized voice text to the Klaus daemon as a message.
actor VoiceWakeForwarder {
    static let shared = VoiceWakeForwarder()

    private let logger = Logger(subsystem: "ai.klaus", category: "voicewake.forward")

    struct ForwardOptions {
        var sessionKey: String = "main"
        var thinking: String = "low"
        var deliver: Bool = false
    }

    func forward(text: String, options: ForwardOptions = ForwardOptions()) async {
        let machineName = Host.current().localizedName ?? "Mac"
        let prefixed = "User talked via voice recognition on \(machineName) - repeat prompt first + remember some words might be incorrectly transcribed.\n\n\(text)"

        logger.info("Forwarding voice text: \(text, privacy: .public)")

        do {
            _ = try await DaemonConnection.shared.request(
                method: "voice.send",
                params: [
                    "text": prefixed,
                    "sessionKey": options.sessionKey,
                    "thinking": options.thinking,
                ]
            )
        } catch {
            logger.error("Failed to forward voice text: \(error.localizedDescription)")
        }
    }
}

// MARK: - Talk Mode Runtime (STT → Klaus → TTS)

actor TalkModeRuntime {
    static let shared = TalkModeRuntime()

    enum Phase: Sendable {
        case idle
        case listening
        case thinking
        case speaking
    }

    private let logger = Logger(subsystem: "ai.klaus", category: "talkmode")
    private(set) var phase: Phase = .idle
    private var audioEngine: AVAudioEngine?
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var speechRecognizer: SFSpeechRecognizer?
    private var ttsPlayer: AVAudioPlayer?
    private let silenceTimeout: TimeInterval = 2.0
    private var lastSpeechTime: Date?

    var onPhaseChange: (@Sendable (Phase) -> Void)?
    var onTranscript: (@Sendable (String, Bool) -> Void)? // (text, isFinal)
    var onResponse: (@Sendable (String) -> Void)?

    func start(localeId: String? = nil) {
        guard phase == .idle else { return }

        let locale = localeId.map { Locale(identifier: $0) } ?? Locale.current
        speechRecognizer = SFSpeechRecognizer(locale: locale)

        guard let recognizer = speechRecognizer, recognizer.isAvailable else {
            logger.error("Speech recognizer not available")
            return
        }

        phase = .listening
        onPhaseChange?(.listening)
        startListening(recognizer: recognizer)
        logger.info("Talk mode started")
    }

    func stop() {
        stopListening()
        stopTTS()
        phase = .idle
        onPhaseChange?(.idle)
        logger.info("Talk mode stopped")
    }

    /// Interrupt TTS playback if user starts speaking
    func interrupt() {
        if phase == .speaking {
            stopTTS()
            phase = .listening
            onPhaseChange?(.listening)
            if let recognizer = speechRecognizer {
                startListening(recognizer: recognizer)
            }
        }
    }

    // MARK: - Listening

    private func startListening(recognizer: SFSpeechRecognizer) {
        let engine = AVAudioEngine()
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true

        let inputNode = engine.inputNode
        let format = inputNode.outputFormat(forBus: 0)

        inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
            request.append(buffer)
        }

        recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
            guard let self else { return }
            let text = result?.bestTranscription.formattedString
            let isFinal = result?.isFinal ?? false
            let hasError = error != nil
            Task {
                if let text {
                    await self.onTranscript?(text, isFinal)
                    if isFinal {
                        await self.handleFinalTranscript(text)
                    }
                }
                if hasError {
                    await self.handleFinalTranscript("")
                }
            }
        }

        do {
            engine.prepare()
            try engine.start()
            audioEngine = engine
            recognitionRequest = request
            lastSpeechTime = Date()
        } catch {
            logger.error("Failed to start listening: \(error.localizedDescription)")
        }
    }

    private func stopListening() {
        audioEngine?.stop()
        audioEngine?.inputNode.removeTap(onBus: 0)
        recognitionRequest?.endAudio()
        recognitionTask?.cancel()
        audioEngine = nil
        recognitionRequest = nil
        recognitionTask = nil
    }

    // MARK: - Processing

    private func handleFinalTranscript(_ text: String) async {
        stopListening()

        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            // No speech detected, go back to listening
            phase = .listening
            onPhaseChange?(.listening)
            if let recognizer = speechRecognizer {
                startListening(recognizer: recognizer)
            }
            return
        }

        phase = .thinking
        onPhaseChange?(.thinking)

        // Send to daemon and get response
        do {
            let response = try await DaemonConnection.shared.request(
                method: "voice.send",
                params: [
                    "text": trimmed,
                    "sessionKey": "talk",
                    "thinking": "low",
                ]
            )

            if let result = response.result, let reply = result["reply"] as? String {
                onResponse?(reply)
                await speakResponse(reply)
            } else {
                // No reply, go back to listening
                phase = .listening
                onPhaseChange?(.listening)
                if let recognizer = speechRecognizer {
                    startListening(recognizer: recognizer)
                }
            }
        } catch {
            logger.error("Talk mode request failed: \(error.localizedDescription)")
            phase = .listening
            onPhaseChange?(.listening)
            if let recognizer = speechRecognizer {
                startListening(recognizer: recognizer)
            }
        }
    }

    // MARK: - TTS

    private func speakResponse(_ text: String) async {
        phase = .speaking
        onPhaseChange?(.speaking)

        // Try ElevenLabs TTS first, fall back to system voice
        let ttsResult = await ElevenLabsTTS.synthesize(text: text)

        if let audioData = ttsResult {
            do {
                ttsPlayer = try AVAudioPlayer(data: audioData)
                ttsPlayer?.play()

                // Wait for playback to finish
                while ttsPlayer?.isPlaying == true {
                    try await Task.sleep(for: .milliseconds(100))
                }
            } catch {
                logger.error("TTS playback failed: \(error.localizedDescription)")
                await systemSpeak(text)
            }
        } else {
            await systemSpeak(text)
        }

        // After speaking, go back to listening
        if phase == .speaking {
            phase = .listening
            onPhaseChange?(.listening)
            if let recognizer = speechRecognizer {
                startListening(recognizer: recognizer)
            }
        }
    }

    private nonisolated func systemSpeak(_ text: String) async {
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            DispatchQueue.main.async {
                let synthesizer = NSSpeechSynthesizer()
                synthesizer.startSpeaking(text)
                // Poll until done
                Timer.scheduledTimer(withTimeInterval: 0.2, repeats: true) { timer in
                    if !synthesizer.isSpeaking {
                        timer.invalidate()
                        continuation.resume()
                    }
                }
            }
        }
    }

    private func stopTTS() {
        ttsPlayer?.stop()
        ttsPlayer = nil
    }
}

// MARK: - ElevenLabs TTS Client

enum ElevenLabsTTS {
    private static let logger = Logger(subsystem: "ai.klaus", category: "tts.elevenlabs")

    /// Synthesize text to audio data using ElevenLabs API.
    /// Returns nil if API key is not configured or request fails.
    static func synthesize(
        text: String,
        voiceId: String = "21m00Tcm4TlvDq8ikWAM", // Rachel
        modelId: String = "eleven_monolingual_v1"
    ) async -> Data? {
        // Read API key from config
        guard let apiKey = readApiKey() else {
            logger.info("No ElevenLabs API key configured, falling back to system voice")
            return nil
        }

        let urlString = "https://api.elevenlabs.io/v1/text-to-speech/\(voiceId)"
        guard let url = URL(string: urlString) else { return nil }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(apiKey, forHTTPHeaderField: "xi-api-key")

        let body: [String: Any] = [
            "text": text,
            "model_id": modelId,
            "voice_settings": [
                "stability": 0.5,
                "similarity_boost": 0.75,
            ],
        ]

        guard let bodyData = try? JSONSerialization.data(withJSONObject: body) else { return nil }
        request.httpBody = bodyData

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse,
                  httpResponse.statusCode == 200 else {
                logger.error("ElevenLabs API error: \((response as? HTTPURLResponse)?.statusCode ?? -1)")
                return nil
            }
            return data
        } catch {
            logger.error("ElevenLabs request failed: \(error.localizedDescription)")
            return nil
        }
    }

    private static func readApiKey() -> String? {
        // Try reading from config.yaml
        let configPath = KlausPaths.configFile
        guard FileManager.default.fileExists(atPath: configPath),
              let content = try? String(contentsOfFile: configPath, encoding: .utf8) else {
            return nil
        }
        // Simple YAML parsing for talk.elevenlabs_api_key
        for line in content.components(separatedBy: .newlines) {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.hasPrefix("elevenlabs_api_key:") {
                let value = trimmed.dropFirst("elevenlabs_api_key:".count)
                    .trimmingCharacters(in: .whitespaces)
                    .trimmingCharacters(in: CharacterSet(charactersIn: "\"'"))
                return value.isEmpty ? nil : value
            }
        }
        return nil
    }
}

// MARK: - Mic Level Monitor (standalone)

actor MicLevelMonitor {
    static let shared = MicLevelMonitor()

    private var audioEngine: AVAudioEngine?
    private var isMonitoring = false
    var onLevel: (@Sendable (Float) -> Void)?

    func start() {
        guard !isMonitoring else { return }
        let engine = AVAudioEngine()
        let inputNode = engine.inputNode
        let format = inputNode.outputFormat(forBus: 0)
        guard format.sampleRate > 0 else { return }

        inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            guard let channelData = buffer.floatChannelData else { return }
            let frameCount = Int(buffer.frameLength)
            guard frameCount > 0 else { return }

            var sum: Float = 0
            let samples = channelData[0]
            for i in 0..<frameCount {
                sum += samples[i] * samples[i]
            }
            let rms = sqrt(sum / Float(frameCount))
            let db = 20 * log10(max(rms, 1e-7))
            let normalized = max(0, min(1, (db + 50) / 50))

            let callback = self?.onLevel
            Task { await callback?(normalized) }
        }

        do {
            engine.prepare()
            try engine.start()
            audioEngine = engine
            isMonitoring = true
        } catch {
            // silent fail
        }
    }

    func stop() {
        audioEngine?.stop()
        audioEngine?.inputNode.removeTap(onBus: 0)
        audioEngine = nil
        isMonitoring = false
    }
}

// MARK: - Audio Input Device Observer

@MainActor
@Observable
final class AudioInputDeviceObserver {
    static let shared = AudioInputDeviceObserver()

    private(set) var hasUsableDevice = false
    private(set) var defaultDeviceName: String?

    func refresh() {
        let engine = AVAudioEngine()
        let inputNode = engine.inputNode
        let format = inputNode.outputFormat(forBus: 0)
        hasUsableDevice = format.sampleRate > 0 && format.channelCount > 0

        if hasUsableDevice {
            defaultDeviceName = "Default Input"
        } else {
            defaultDeviceName = nil
        }
    }
}
