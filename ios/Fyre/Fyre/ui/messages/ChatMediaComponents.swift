import SwiftUI
import UIKit
import PhotosUI
import UniformTypeIdentifiers
import AVKit
import AVFoundation
import QuickLook
import Combine

@MainActor
final class ChatAudioPlaybackController: NSObject, ObservableObject, AVAudioPlayerDelegate {
    let objectWillChange: ObservableObjectPublisher

    @Published private(set) var activeKey: String?
    @Published private(set) var loadingKey: String?
    @Published private(set) var currentTime: TimeInterval = 0
    @Published private(set) var duration: TimeInterval = 0
    @Published private(set) var playbackErrorMessage: String?

    private var player: AVAudioPlayer?
    private var progressTimer: Timer?

    override init() {
        objectWillChange = ObservableObjectPublisher()
        super.init()
    }

    func togglePendingAttachment(_ attachment: PendingChatAttachment, key: String) async {
        await toggleAudioData(attachment.data, key: key)
    }

    func toggleAudioData(_ data: Data, key: String) async {
        if activeKey == key {
            stop()
            return
        }

        do {
            playbackErrorMessage = nil
            try configurePlaybackSession()
            let player = try AVAudioPlayer(data: data)
            try play(player: player, key: key)
        } catch {
            playbackErrorMessage = L10n.tr("chat.voice.playbackFailed")
#if DEBUG
            debugPrint("Pending audio playback failed")
#endif
        }
    }

    func reportPlaybackUnavailable() {
        playbackErrorMessage = AttachmentPreviewError.unavailable.localizedDescription
    }

    func toggleRemoteAttachment(
        _ attachment: MessageAttachmentDTO,
        key: String,
        loader: @escaping () async throws -> Data?
    ) async {
        if activeKey == key {
            stop()
            return
        }

        loadingKey = key

        do {
            playbackErrorMessage = nil
            guard let data = try await loader(), !data.isEmpty else {
                loadingKey = nil
                playbackErrorMessage = AttachmentPreviewError.unavailable.localizedDescription
                return
            }

            try configurePlaybackSession()
            let player = try AVAudioPlayer(data: data)
            loadingKey = nil
            try play(player: player, key: key)
        } catch {
            loadingKey = nil
            playbackErrorMessage = L10n.tr("chat.voice.playbackFailed")
#if DEBUG
            debugPrint("Remote audio playback failed")
#endif
        }
    }

    func stop() {
        player?.stop()
        player = nil
        activeKey = nil
        loadingKey = nil
        currentTime = 0
        duration = 0
        stopProgressTimer()
    }

    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        _ = flag
        stop()
    }

    private func play(player: AVAudioPlayer, key: String) throws {
        stop()
        self.player = player
        self.player?.delegate = self
        self.player?.prepareToPlay()
        currentTime = 0
        duration = player.duration
        guard self.player?.play() == true else {
            throw ChatVoicePlaybackError.startFailed
        }
        activeKey = key
        startProgressTimer()
    }

    private func configurePlaybackSession() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playback, mode: .default, options: [.defaultToSpeaker, .allowBluetoothA2DP])
        try session.setActive(true)
    }

    func currentTime(for key: String) -> TimeInterval {
        activeKey == key ? currentTime : 0
    }

    func displayDuration(for key: String, fallbackDuration: Int?) -> TimeInterval {
        if activeKey == key, duration > 0 {
            return duration
        }

        return TimeInterval(max(0, fallbackDuration ?? 0))
    }

    private func startProgressTimer() {
        stopProgressTimer()
        progressTimer = Timer.scheduledTimer(timeInterval: 0.08, target: self, selector: #selector(updatePlaybackProgress), userInfo: nil, repeats: true)
    }

    private func stopProgressTimer() {
        progressTimer?.invalidate()
        progressTimer = nil
    }

    @objc
    private func updatePlaybackProgress() {
        guard let player else { return }
        currentTime = player.currentTime
        duration = player.duration
    }
}

enum ChatVoicePlaybackError: LocalizedError {
    case startFailed

    var errorDescription: String? {
        switch self {
        case .startFailed:
            return L10n.tr("chat.voice.playbackFailed")
        }
    }
}

@MainActor
final class ChatVoiceRecorder: NSObject, ObservableObject, AVAudioRecorderDelegate {
    let objectWillChange: ObservableObjectPublisher

    @Published private(set) var isRecording = false
    @Published private(set) var elapsedDuration: TimeInterval = 0

    var elapsedDurationLabel: String {
        let totalSeconds = max(0, Int(elapsedDuration.rounded()))
        let minutes = totalSeconds / 60
        let seconds = totalSeconds % 60
        return String(format: "%d:%02d", minutes, seconds)
    }

    private var recorder: AVAudioRecorder?
    private var recordingURL: URL?
    private var timer: Timer?

    override init() {
        objectWillChange = ObservableObjectPublisher()
        super.init()
    }

    func start() async throws {
        guard !isRecording else { return }

        let session = AVAudioSession.sharedInstance()
        let granted = await requestPermission(session: session)
        guard granted else {
            throw ChatVoiceRecordingError.permissionDenied
        }

        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("voice-\(UUID().uuidString)")
            .appendingPathExtension("m4a")
        let settings: [String: Any] = [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: 44_100,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
        ]

        do {
            try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetoothHFP, .allowBluetoothA2DP])
            try session.setActive(true)

            let recorder = try AVAudioRecorder(url: url, settings: settings)
            recorder.delegate = self
            recorder.isMeteringEnabled = false

            guard recorder.record() else {
                throw ChatVoiceRecordingError.startFailed
            }

            self.recorder = recorder
            recordingURL = url
            elapsedDuration = 0
            isRecording = true
            startTimer()
        } catch {
            try? FileManager.default.removeItem(at: url)
            try? deactivateSession()
            throw error
        }
    }

    func stop() throws -> PendingChatAttachment {
        guard let recorder, let recordingURL else {
            throw ChatVoiceRecordingError.noRecording
        }
        defer {
            try? FileManager.default.removeItem(at: recordingURL)
        }

        let duration = max(1, Int(recorder.currentTime.rounded()))
        recorder.stop()
        stopTimer()
        self.recorder = nil
        self.recordingURL = nil
        isRecording = false

        defer { try? deactivateSession() }
        let data = try BoundedAttachment.read(recordingURL)

        guard !data.isEmpty else {
            throw ChatVoiceRecordingError.invalidRecording
        }

        return PendingChatAttachment.voiceMessage(
            data: data,
            fileName: recordingURL.lastPathComponent,
            duration: duration
        )
    }

    func cancel() {
        let ownedRecordingURL = recordingURL
        recorder?.stop()
        recorder = nil
        recordingURL = nil
        isRecording = false
        elapsedDuration = 0
        stopTimer()
        try? deactivateSession()
        if let ownedRecordingURL {
            try? FileManager.default.removeItem(at: ownedRecordingURL)
        }
    }

    private func requestPermission(session: AVAudioSession) async -> Bool {
        await withCheckedContinuation { continuation in
            if #available(iOS 17.0, *) {
                AVAudioApplication.requestRecordPermission { granted in
                    continuation.resume(returning: granted)
                }
            } else {
                session.requestRecordPermission { granted in
                    continuation.resume(returning: granted)
                }
            }
        }
    }

    private func startTimer() {
        stopTimer()
        timer = Timer.scheduledTimer(timeInterval: 0.1, target: self, selector: #selector(updateElapsedDuration), userInfo: nil, repeats: true)
    }

    private func stopTimer() {
        timer?.invalidate()
        timer = nil
    }

    @objc
    private func updateElapsedDuration() {
        guard let recorder else { return }
        elapsedDuration = recorder.currentTime
    }

    private func deactivateSession() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setActive(false, options: [.notifyOthersOnDeactivation])
    }
}

enum ChatVoiceRecordingError: LocalizedError {
    case permissionDenied
    case startFailed
    case noRecording
    case invalidRecording

    var errorDescription: String? {
        switch self {
        case .permissionDenied:
            return L10n.tr("chat.voice.permissionDenied")
        case .startFailed:
            return L10n.tr("chat.voice.startFailed")
        case .noRecording, .invalidRecording:
            return L10n.tr("chat.voice.stopFailed")
        }
    }
}

struct PendingChatAttachment {
    static let importerContentTypes: [UTType] = [
        .jpeg,
        .png,
        .webP,
        .heic,
        .pdf,
        .mpeg4Audio,
        .mp3,
        .wav,
        .mpeg4Movie,
        .quickTimeMovie
    ]

    let data: Data
    let fileName: String
    let mimeType: String
    let type: MessageTypeDTO
    let size: Int
    let width: Int?
    let height: Int?
    let duration: Int?
    let previewImage: UIImage?

    var outgoingAttachment: OutgoingAttachmentDTO {
        OutgoingAttachmentDTO(
            data: data,
            fileName: fileName,
            mimeType: mimeType,
            type: type,
            size: size,
            width: width,
            height: height,
            duration: duration
        )
    }

    static func voiceMessage(data: Data, fileName: String, mimeType: String = "audio/mp4", duration: Int) -> PendingChatAttachment {
        PendingChatAttachment(
            data: data,
            fileName: normalizedFileName(from: fileName, fileExtension: "m4a"),
            mimeType: mimeType,
            type: .audio,
            size: data.count,
            width: nil,
            height: nil,
            duration: duration,
            previewImage: nil
        )
    }

    static func supports(contentType: UTType) -> Bool {
        contentType.conforms(to: .image)
            || contentType.conforms(to: .quickTimeMovie)
            || contentType.conforms(to: .mpeg4Movie)
            || contentType.conforms(to: .mpeg4Audio)
            || contentType.conforms(to: .mp3)
            || contentType.conforms(to: .wav)
            || contentType.conforms(to: .pdf)
    }

    static func from(data: Data, fileName: String, contentType: UTType) throws -> PendingChatAttachment {
        try BoundedAttachment.validate(data)
        let size = data.count

        if contentType.conforms(to: .image), let image = BoundedAttachment.previewImage(from: data) {
            let jpegData = image.jpegData(compressionQuality: 0.96) ?? data
            try BoundedAttachment.validate(jpegData)
            let jpegFileName = normalizedFileName(from: fileName, fileExtension: "jpg")
            return PendingChatAttachment(
                data: jpegData,
                fileName: jpegFileName,
                mimeType: "image/jpeg",
                type: .image,
                size: jpegData.count,
                width: Int(image.size.width),
                height: Int(image.size.height),
                duration: nil,
                previewImage: image
            )
        }

        if contentType.conforms(to: .quickTimeMovie) {
            return PendingChatAttachment(
                data: data,
                fileName: normalizedFileName(from: fileName, fileExtension: "mov"),
                mimeType: "video/quicktime",
                type: .video,
                size: size,
                width: nil,
                height: nil,
                duration: nil,
                previewImage: nil
            )
        }

        if contentType.conforms(to: .mpeg4Movie) {
            return PendingChatAttachment(
                data: data,
                fileName: normalizedFileName(from: fileName, fileExtension: "mp4"),
                mimeType: "video/mp4",
                type: .video,
                size: size,
                width: nil,
                height: nil,
                duration: nil,
                previewImage: nil
            )
        }

        let audioFormat: (fileExtension: String, mimeType: String)? = whenAudioFormat(contentType)
        if let audioFormat {
            return PendingChatAttachment(
                data: data,
                fileName: normalizedFileName(from: fileName, fileExtension: audioFormat.fileExtension),
                mimeType: audioFormat.mimeType,
                type: .audio,
                size: size,
                width: nil,
                height: nil,
                duration: audioDuration(from: data),
                previewImage: nil
            )
        }

        if contentType.conforms(to: .pdf) {
            return PendingChatAttachment(
                data: data,
                fileName: normalizedFileName(from: fileName, fileExtension: "pdf"),
                mimeType: "application/pdf",
                type: .file,
                size: size,
                width: nil,
                height: nil,
                duration: nil,
                previewImage: nil
            )
        }

        throw ChatAttachmentValidationError.unsupportedFormat
    }

    private static func whenAudioFormat(_ contentType: UTType) -> (fileExtension: String, mimeType: String)? {
        if contentType.conforms(to: .mpeg4Audio) {
            return ("m4a", "audio/mp4")
        }
        if contentType.conforms(to: .mp3) {
            return ("mp3", "audio/mpeg")
        }
        if contentType.conforms(to: .wav) {
            return ("wav", "audio/wav")
        }
        return nil
    }

    private static func normalizedFileName(from rawFileName: String, fileExtension: String) -> String {
        let trimmed = rawFileName.trimmingCharacters(in: .whitespacesAndNewlines)
        let invalidCharacters = CharacterSet(charactersIn: "/:\\")
        let candidate = trimmed.components(separatedBy: invalidCharacters).last ?? ""
        let baseName = (candidate as NSString).deletingPathExtension.trimmingCharacters(in: .whitespacesAndNewlines)
        let resolvedBaseName = baseName.isEmpty ? "attachment-\(UUID().uuidString)" : baseName
        return "\(resolvedBaseName).\(fileExtension)"
    }

    private static func audioDuration(from data: Data) -> Int? {
        guard let player = try? AVAudioPlayer(data: data) else {
            return nil
        }

        return max(1, Int(player.duration.rounded()))
    }
}

struct ChatDetailTabBarHidingModifier: ViewModifier {
    @ViewBuilder
    func body(content: Content) -> some View {
        content.toolbar(.hidden, for: .tabBar)
    }
}

struct CameraCaptureView: UIViewControllerRepresentable {
    let onCapture: (UIImage?) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeCoordinator() -> Coordinator {
        Coordinator(onCapture: onCapture, dismiss: dismiss)
    }

    func makeUIViewController(context: Context) -> FullScreenCameraPickerController {
        let controller = FullScreenCameraPickerController()
        controller.sourceType = .camera
        controller.mediaTypes = ["public.image"]
        controller.delegate = context.coordinator
        controller.allowsEditing = false
        controller.modalPresentationStyle = .fullScreen
        controller.modalTransitionStyle = .coverVertical
        controller.view.backgroundColor = .black
        return controller
    }

    func updateUIViewController(_ uiViewController: FullScreenCameraPickerController, context: Context) {}

    final class Coordinator: NSObject, UINavigationControllerDelegate, UIImagePickerControllerDelegate {
        private let onCapture: (UIImage?) -> Void
        private let dismiss: DismissAction

        init(onCapture: @escaping (UIImage?) -> Void, dismiss: DismissAction) {
            self.onCapture = onCapture
            self.dismiss = dismiss
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            dismiss()
        }

        func imagePickerController(
            _ picker: UIImagePickerController,
            didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
        ) {
            let image = info[.originalImage] as? UIImage
            onCapture(image)
            dismiss()
        }
    }
}

final class FullScreenCameraPickerController: UIImagePickerController {
    override var prefersStatusBarHidden: Bool { true }
    override var preferredStatusBarUpdateAnimation: UIStatusBarAnimation { .fade }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
    }
}

struct RemoteChatAttachmentImage: View {
    @Environment(AppServices.self) private var services
    let fileId: String
    var localData: Data? = nil
    @State private var image: UIImage?

    var body: some View {
        Group {
            if let localImage {
                Image(uiImage: localImage)
                    .resizable()
                    .interpolation(.high)
                    .antialiased(true)
                    .scaledToFit()
            } else if let image {
                Image(uiImage: image)
                    .resizable()
                    .interpolation(.high)
                    .antialiased(true)
                    .scaledToFit()
            } else {
                Rectangle()
                    .fill(.white.opacity(0.06))
                    .overlay {
                        ProgressView()
                    }
            }
        }
        .task(id: fileId) {
            guard localData == nil, image == nil, !isLocalAttachmentFileId(fileId) else { return }
            do {
                if let data = try await services.backend.fetchAttachmentData(fileId: fileId),
                   let loadedImage = UIImage(data: data) {
                    image = loadedImage.preparingForDisplay() ?? loadedImage
                }
            } catch {
#if DEBUG
                debugPrint("Attachment image load failed")
#endif
            }
        }
    }

    private var localImage: UIImage? {
        guard let localData,
              let image = UIImage(data: localData) else {
            return nil
        }

        return image.preparingForDisplay() ?? image
    }
}

struct RemoteChatAttachmentVideoPreview: View {
    @Environment(AppServices.self) private var services
    let fileId: String
    var localData: Data? = nil
    let title: String?
    let duration: Int?
    @State private var thumbnail: UIImage?
    @State private var isLoading = false

    var body: some View {
        ZStack(alignment: .center) {
            if let thumb = thumbnail {
                Image(uiImage: thumb)
                    .resizable()
                    .interpolation(.high)
                    .antialiased(true)
                    .scaledToFill()
            } else {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(.white.opacity(0.06))
                    .overlay {
                        VStack(spacing: 6) {
                            Image(systemName: "video.fill")
                                .font(.title2)
                                .foregroundStyle(.orange)

                            if let dur = duration {
                                Text("\(dur)s")
                                    .font(.caption.monospacedDigit())
                                    .foregroundStyle(.secondary)
                            } else if isLoading {
                                ProgressView()
                            }
                        }
                    }
            }

            Circle()
                .fill(Color.black.opacity(0.36))
                .frame(width: 48, height: 48)
                .overlay {
                    Image(systemName: "play.fill")
                        .font(.headline.weight(.bold))
                        .foregroundStyle(.white)
                }
                .shadow(color: .black.opacity(0.24), radius: 6, y: 2)
        }
        .task(id: fileId) {
            guard thumbnail == nil, !isLoading else { return }
            isLoading = true
            do {
                let data: Data?
                if let local = localData {
                    data = local
                } else if !isLocalAttachmentFileId(fileId) {
                    data = try await services.backend.fetchAttachmentData(fileId: fileId)
                } else {
                    data = nil
                }

                if let data, !data.isEmpty {
                    let tmpUrl = try writeTempVideo(data: data, baseName: title)
                    defer {
                        try? FileManager.default.removeItem(at: tmpUrl)
                    }
                    let asset = AVAsset(url: tmpUrl)
                    let generator = AVAssetImageGenerator(asset: asset)
                    generator.appliesPreferredTrackTransform = true
                    let duration = try await asset.load(.duration)
                    let time = CMTime(seconds: min(1.0, CMTimeGetSeconds(duration)), preferredTimescale: 600)
                    if let cgImage = try? generator.copyCGImage(at: time, actualTime: nil) {
                        thumbnail = UIImage(cgImage: cgImage).preparingForDisplay() ?? UIImage(cgImage: cgImage)
                    }
                }
            } catch {
#if DEBUG
                debugPrint("Video thumbnail generation failed")
#endif
            }
            isLoading = false
        }
    }

    private func writeTempVideo(data: Data, baseName: String?) throws -> URL {
        let fileManager = FileManager.default
        let directory = fileManager.temporaryDirectory.appendingPathComponent("ChatAttachmentPreview", isDirectory: true)
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)

        let cleaned = (baseName?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false) ? baseName! : UUID().uuidString
        let url = directory.appendingPathComponent("\(cleaned)-\(UUID().uuidString).mp4")
        try data.write(to: url, options: .atomic)
        return url
    }
}

func isLocalAttachmentFileId(_ fileId: String) -> Bool {
    fileId.hasPrefix("local-")
}

final class OwnedChatPreviewFile: @unchecked Sendable {
    let url: URL

    init(url: URL) {
        self.url = url
    }

    func remove() {
        try? FileManager.default.removeItem(at: url)
    }

    deinit {
        remove()
    }
}

struct ChatAttachmentPreview: Identifiable {
    enum Kind {
        case image
        case video
        case file
    }

    let id = UUID()
    let kind: Kind
    let image: UIImage?
    private let ownedTemporaryFile: OwnedChatPreviewFile?
    let title: String

    var fileURL: URL? {
        ownedTemporaryFile?.url
    }

    func removeOwnedTemporaryFile() {
        ownedTemporaryFile?.remove()
    }

    static func make(attachment: MessageAttachmentDTO, kind: Kind, data: Data) throws -> ChatAttachmentPreview {
        switch kind {
        case .image:
            guard let image = UIImage(data: data) else {
                throw AttachmentPreviewError.invalidData
            }
            return ChatAttachmentPreview(
                kind: .image,
                image: image,
                ownedTemporaryFile: nil,
                title: defaultTitle(for: .image)
            )

        case .video, .file:
            let url = try writeTemporaryFile(
                data: data,
                fileName: attachment.name,
                mimeType: attachment.mimeType
            )
            return ChatAttachmentPreview(
                kind: kind,
                image: nil,
                ownedTemporaryFile: OwnedChatPreviewFile(url: url),
                title: attachment.name ?? defaultTitle(for: kind)
            )
        }
    }

    private static func writeTemporaryFile(data: Data, fileName: String?, mimeType: String?) throws -> URL {
        let fileManager = FileManager.default
        let directory = fileManager.temporaryDirectory.appendingPathComponent("ChatAttachmentPreview", isDirectory: true)
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)

        let trimmedFileName = fileName?.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanedBaseName: String
        if let trimmedFileName, !trimmedFileName.isEmpty {
            cleanedBaseName = trimmedFileName
        } else {
            cleanedBaseName = UUID().uuidString
        }
        let baseNSString = cleanedBaseName as NSString
        let stem = baseNSString.deletingPathExtension.isEmpty ? cleanedBaseName : baseNSString.deletingPathExtension
        let ext = preferredExtension(fileName: fileName, mimeType: mimeType)
        let url = directory.appendingPathComponent("\(stem)-\(UUID().uuidString).\(ext)")
        try data.write(to: url, options: .atomic)
        return url
    }

    private static func preferredExtension(fileName: String?, mimeType: String?) -> String {
        if let fileName {
            let ext = (fileName as NSString).pathExtension.trimmingCharacters(in: .whitespacesAndNewlines)
            if !ext.isEmpty { return ext }
        }

        if let mimeType,
           let utType = UTType(mimeType: mimeType),
           let ext = utType.preferredFilenameExtension {
            return ext
        }

        return "dat"
    }

    private static func defaultTitle(for kind: Kind) -> String {
        switch kind {
        case .image:
            return L10n.tr("chat.attachment.photo")
        case .video:
            return L10n.tr("chat.attachment.video")
        case .file:
            return L10n.tr("chat.attachment.file")
        }
    }
}

enum AttachmentPreviewError: LocalizedError {
    case unavailable
    case invalidData

    var errorDescription: String? {
        switch self {
        case .unavailable:
            return "Unable to load attachment."
        case .invalidData:
            return "Invalid attachment data."
        }
    }
}

struct ChatAttachmentPreviewSheet: View {
    let preview: ChatAttachmentPreview
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Group {
                switch preview.kind {
                case .image:
                    if let image = preview.image {
                        Color.black
                            .overlay {
                                Image(uiImage: image)
                                    .resizable()
                                    .scaledToFit()
                                    .padding()
                            }
                            .ignoresSafeArea()
                    }
                case .video:
                    if let fileURL = preview.fileURL {
                        VideoPlayer(player: AVPlayer(url: fileURL))
                            .background(Color.black.ignoresSafeArea())
                    }
                case .file:
                    if let fileURL = preview.fileURL {
                        QuickLookPreview(fileURL: fileURL)
                    }
                }
            }
            .navigationTitle(preview.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(L10n.tr("common.done")) {
                        dismiss()
                    }
                }
            }
        }
    }
}

struct MessageReadInfoSheet: View {
    let message: ChatMessage
    let readAt: Date?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section(L10n.tr("chat.messageInfo.content")) {
                    messageContentView
                        .listRowBackground(Color.clear)
                        .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 0))
                }

                Section {
                    infoCard
                        .listRowBackground(Color.clear)
                        .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 0))
                }
            }
            .navigationTitle(L10n.tr("chat.messageInfo.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(L10n.tr("common.done")) {
                        dismiss()
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var messageContentView: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let attachment = message.attachment {
                messageAttachmentSummary(attachment)
            }

            let trimmedText = message.text.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmedText.isEmpty {
                Text(trimmedText)
                    .font(.body)
                    .foregroundStyle(.primary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(14)
        .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private var infoCard: some View {
        VStack(spacing: 0) {
            infoRow(
                title: L10n.tr("chat.messageInfo.sent"),
                value: Self.dateFormatter.string(from: message.sentAt)
            )
            .padding(.horizontal, 14)
            .padding(.vertical, 16)

            Divider()
                .padding(.leading, 14)

            infoRow(
                title: L10n.tr("chat.messageInfo.read"),
                value: readAt.map { Self.dateFormatter.string(from: $0) } ?? L10n.tr("chat.messageInfo.unread")
            )
            .padding(.horizontal, 14)
            .padding(.vertical, 16)
        }
        .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    @ViewBuilder
    private func messageAttachmentSummary(_ attachment: MessageAttachmentDTO) -> some View {
        switch message.messageType {
        case .image:
            HStack(spacing: 12) {
                RemoteChatAttachmentImage(fileId: attachment.fileId)
                    .frame(width: 76, height: 76)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .stroke(.white.opacity(0.10), lineWidth: 1)
                    }

                VStack(alignment: .leading, spacing: 4) {
                    Text(L10n.tr("chat.attachment.photo"))
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.primary)
                }

                Spacer(minLength: 0)
            }

        case .video, .audio, .file:
            HStack(spacing: 12) {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(.white.opacity(0.06))
                    .frame(width: 76, height: 76)
                    .overlay {
                        Image(systemName: attachmentSummaryIconName)
                            .font(.title2.weight(.semibold))
                            .foregroundStyle(.orange)
                    }

                VStack(alignment: .leading, spacing: 4) {
                    Text(attachmentSummaryTitle)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.primary)

                    if let name = attachment.name, !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        Text(name)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                    } else if let mimeType = attachment.mimeType, !mimeType.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        Text(mimeType)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }

                Spacer(minLength: 0)
            }

        case .text:
            EmptyView()
        }
    }

    private var attachmentSummaryIconName: String {
        switch message.messageType {
        case .video:
            return "video.fill"
        case .audio:
            return "waveform"
        case .file:
            return "doc.fill"
        case .image, .text:
            return "doc.fill"
        }
    }

    private var attachmentSummaryTitle: String {
        switch message.messageType {
        case .video:
            return L10n.tr("chat.attachment.video")
        case .audio:
            return L10n.tr("chat.attachment.audio")
        case .file:
            return L10n.tr("chat.attachment.file")
        case .image, .text:
            return L10n.tr("chat.attachment.file")
        }
    }

    private func infoRow(title: String, value: String) -> some View {
        HStack {
            Text(title)
                .foregroundStyle(.secondary)
            Spacer()
            Text(value)
                .multilineTextAlignment(.trailing)
        }
    }

    private static let dateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "it_IT")
        formatter.dateStyle = .short
        formatter.timeStyle = .short
        return formatter
    }()
}

struct ChatAvatarPreviewSheet: View {
    @Environment(\.dismiss) private var dismiss
    let name: String
    let avatarKey: String

    var body: some View {
        NavigationStack {
            ZStack {
                Color(uiColor: .systemBackground)
                    .ignoresSafeArea()

                ChatAvatarView(
                    name: name,
                    avatarKey: avatarKey,
                    size: 240,
                    isOnline: false,
                    showsPresence: false
                )
                .padding(28)
            }
            .navigationTitle(name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(L10n.tr("common.done")) {
                        dismiss()
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }
}

struct QuickLookPreview: UIViewControllerRepresentable {
    let fileURL: URL

    func makeCoordinator() -> Coordinator {
        Coordinator(fileURL: fileURL)
    }

    func makeUIViewController(context: Context) -> QLPreviewController {
        let controller = QLPreviewController()
        controller.dataSource = context.coordinator
        return controller
    }

    func updateUIViewController(_ uiViewController: QLPreviewController, context: Context) {
        context.coordinator.fileURL = fileURL
        uiViewController.reloadData()
    }

    final class Coordinator: NSObject, QLPreviewControllerDataSource {
        var fileURL: URL

        init(fileURL: URL) {
            self.fileURL = fileURL
        }

        func numberOfPreviewItems(in controller: QLPreviewController) -> Int {
            1
        }

        func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem {
            fileURL as NSURL
        }
    }
}

enum MessageBubblePosition {
    case single
    case first
    case middle
    case last
}

struct MessageBubbleShape: Shape {
    let isOutgoing: Bool
    let position: MessageBubblePosition
    let cornerRadius: CGFloat

    func path(in rect: CGRect) -> Path {
        UnevenRoundedRectangle(
            cornerRadii: radii,
            style: .continuous
        )
        .path(in: rect)
    }

    private var radii: RectangleCornerRadii {
        if isOutgoing {
            switch position {
            case .single:
                return RectangleCornerRadii(
                    topLeading: cornerRadius,
                    bottomLeading: cornerRadius,
                    bottomTrailing: cornerRadius,
                    topTrailing: cornerRadius
                )
            case .first:
                return RectangleCornerRadii(
                    topLeading: cornerRadius,
                    bottomLeading: cornerRadius,
                    bottomTrailing: 7,
                    topTrailing: cornerRadius
                )
            case .middle:
                return RectangleCornerRadii(
                    topLeading: cornerRadius,
                    bottomLeading: cornerRadius,
                    bottomTrailing: 7,
                    topTrailing: 7
                )
            case .last:
                return RectangleCornerRadii(
                    topLeading: cornerRadius,
                    bottomLeading: cornerRadius,
                    bottomTrailing: cornerRadius,
                    topTrailing: 7
                )
            }
        } else {
            switch position {
            case .single:
                return RectangleCornerRadii(
                    topLeading: cornerRadius,
                    bottomLeading: cornerRadius,
                    bottomTrailing: cornerRadius,
                    topTrailing: cornerRadius
                )
            case .first:
                return RectangleCornerRadii(
                    topLeading: cornerRadius,
                    bottomLeading: 7,
                    bottomTrailing: cornerRadius,
                    topTrailing: cornerRadius
                )
            case .middle:
                return RectangleCornerRadii(
                    topLeading: 7,
                    bottomLeading: 7,
                    bottomTrailing: cornerRadius,
                    topTrailing: cornerRadius
                )
            case .last:
                return RectangleCornerRadii(
                    topLeading: 7,
                    bottomLeading: cornerRadius,
                    bottomTrailing: cornerRadius,
                    topTrailing: cornerRadius
                )
            }
        }
    }
}
