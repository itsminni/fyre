//
//  ChatDetailView.swift
//  Fyre
//
//  Created by Gabriele Mininni on 10/03/26.
//

import SwiftUI
import UIKit
import PhotosUI
import UniformTypeIdentifiers
import AVKit
import AVFoundation
import QuickLook
import Combine

private extension Color {
    var perceivedLuminance: Double {
        let uiColor = UIColor(self)
        var red: CGFloat = 0
        var green: CGFloat = 0
        var blue: CGFloat = 0
        var alpha: CGFloat = 0

        guard uiColor.getRed(&red, green: &green, blue: &blue, alpha: &alpha) else {
            return 0
        }

        return (0.2126 * Double(red)) + (0.7152 * Double(green)) + (0.0722 * Double(blue))
    }
}

private struct ChatMessageFramesPreferenceKey: PreferenceKey {
    static var defaultValue: [UUID: CGRect] = [:]

    static func reduce(value: inout [UUID: CGRect], nextValue: () -> [UUID: CGRect]) {
        value.merge(nextValue(), uniquingKeysWith: { _, new in new })
    }
}

private struct ChatScrollViewportHeightPreferenceKey: PreferenceKey {
    static var defaultValue: CGFloat = 0

    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

private struct ChatBottomAnchorMinYPreferenceKey: PreferenceKey {
    static var defaultValue: CGFloat = 0

    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

private struct ChatScrollViewportHeightReader: View {
    var body: some View {
        GeometryReader { geometry in
            Color.clear.preference(
                key: ChatScrollViewportHeightPreferenceKey.self,
                value: geometry.size.height
            )
        }
    }
}

private struct ChatBottomAnchorReader: View {
    var body: some View {
        GeometryReader { geometry in
            Color.clear.preference(
                key: ChatBottomAnchorMinYPreferenceKey.self,
                value: geometry.frame(in: .named("chatScrollView")).minY
            )
        }
    }
}

private struct VisualEffectBlurView: UIViewRepresentable {
    let style: UIBlurEffect.Style

    func makeUIView(context: Context) -> UIVisualEffectView {
        UIVisualEffectView(effect: UIBlurEffect(style: style))
    }

    func updateUIView(_ uiView: UIVisualEffectView, context: Context) {
        uiView.effect = UIBlurEffect(style: style)
    }
}

private struct VoiceWaveformProgressView: View {
    let progress: CGFloat
    let isPlaying: Bool
    let tint: Color
    let trackTint: Color

    private let amplitudes: [CGFloat] = [
        0.34, 0.58, 0.42, 0.82, 0.50, 0.68, 0.38, 0.92,
        0.55, 0.74, 0.44, 0.64, 0.86, 0.48, 0.70, 0.36,
        0.76, 0.52, 0.62, 0.40, 0.84, 0.56
    ]

    var body: some View {
        GeometryReader { geometry in
            let clampedProgress = min(max(progress, 0), 1)
            let activeWidth = geometry.size.width * clampedProgress

            HStack(alignment: .center, spacing: 3) {
                ForEach(Array(amplitudes.enumerated()), id: \.offset) { index, amplitude in
                    let barWidth = max(2, (geometry.size.width - CGFloat(amplitudes.count - 1) * 3) / CGFloat(amplitudes.count))
                    let midpoint = CGFloat(index) * (barWidth + 3) + (barWidth / 2)
                    let isActive = midpoint <= activeWidth

                    Capsule(style: .continuous)
                        .fill(isActive ? tint : trackTint)
                        .frame(width: barWidth, height: max(5, geometry.size.height * amplitude))
                        .animation(.easeOut(duration: 0.16), value: clampedProgress)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        }
        .frame(height: 26)
        .opacity(isPlaying ? 1 : 0.86)
    }
}

private struct LegacyHeaderButtonFrameModifier: ViewModifier {
    let isLegacy: Bool

    @ViewBuilder
    func body(content: Content) -> some View {
        if isLegacy {
            content.frame(width: 44, height: 44, alignment: .center)
        } else {
            content
        }
    }
}

private enum AttachmentPickerMode {
    case media
    case photos
    case videos

    var filter: PHPickerFilter {
        switch self {
        case .media:
            return .any(of: [.images, .videos])
        case .photos:
            return .images
        case .videos:
            return .videos
        }
    }
}

enum ChatAttachmentValidationError: LocalizedError {
    case unsupportedFormat

    var errorDescription: String? {
        switch self {
        case .unsupportedFormat:
            return L10n.tr("chat.attachment.unsupportedFormat")
        }
    }
}

private struct ComposerLayoutMetrics {
    let progress: CGFloat

    var sideSpacing: CGFloat {
        4 + (progress * 8)
    }

    var sideButtonScale: CGFloat {
        1 + (progress * 0.02)
    }

    var sideButtonSize: CGFloat {
        40 + (progress * 2)
    }

    var fieldHorizontalPadding: CGFloat {
        13 + (progress * 1.25)
    }

    var fieldVerticalPadding: CGFloat {
        8 + (progress * 1.25)
    }

    var fieldCornerRadius: CGFloat {
        20 + (progress * 1.5)
    }

    var fieldMinHeight: CGFloat {
        42 + (progress * 2)
    }

    var inlineAccessorySize: CGFloat {
        26
    }

    var sendButtonSize: CGFloat {
        40 + (progress * 2)
    }
}

struct ChatDetailView: View {
    private static let messageLinkDetector = try? NSDataDetector(
        types: NSTextCheckingResult.CheckingType.link.rawValue
    )

    private struct PendingRelationshipAction: Identifiable {
        let id = UUID()
        let action: RelationshipActionDTO
    }

    private struct AvatarPreview: Identifiable {
        let id = UUID()
        let name: String
        let avatarKey: String
    }

    @Environment(AppServices.self) private var services
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.colorScheme) private var colorScheme
    @AppStorage("settings_chat_background_style") private var chatBackgroundStyle = ChatBackgroundStyle.defaultDark.rawValue
    @AppStorage("settings_chat_background_brightness") private var chatBackgroundBrightness = 0.0
    @AppStorage("settings_chat_background_color_1") private var chatBackgroundColor1Hex = "#3F4755"
    @AppStorage("settings_chat_background_color_2") private var chatBackgroundColor2Hex = "#8B7A74"
    @AppStorage("settings_chat_background_color_3") private var chatBackgroundColor3Hex = "#B9A89B"
    @AppStorage("settings_chat_outgoing_bubble_palette") private var outgoingBubblePalette = ChatBubblePalette.default.rawValue
    @AppStorage("settings_chat_incoming_bubble_palette") private var incomingBubblePalette = ChatBubblePalette.default.rawValue
    @AppStorage("settings_send_button_color_1") private var sendButtonColor1Hex = "#FF9A00"
    @AppStorage("settings_send_button_color_2") private var sendButtonColor2Hex = "#FF8A1F"
    @AppStorage("settings_send_button_color_3") private var sendButtonColor3Hex = "#E14D33"
    let thread: ChatThread

    @State private var threadName: String
    @State private var threadAvatar: String
    @State private var threadIsOnline: Bool
    @State private var otherParticipantReadAt: Date?
    @State private var threadNotificationsEnabled: Bool
    @State private var relationshipState: RelationshipStateDTO
    @State private var messages: [ChatMessage]
    @State private var olderMessagesCursor: String?
    @State private var isLoadingOlderMessages = false
    @State private var historyLoadFailed = false
    @State private var historyLoadTask: Task<Void, Never>?
    @State private var isRefreshingThread = false
    @State private var latestHistoryAnchor: ChatMessage?
    @State private var visibleMessageID: UUID?
    @State private var historyScrollRestoreID: UUID?
    @State private var isHistoryScrollReady = false
    @State private var draft = ""
    @State private var pendingAttachment: PendingChatAttachment?
    @State private var pickedAttachmentItem: PhotosPickerItem?
    @State private var attachmentPickerMode: AttachmentPickerMode = .photos
    @State private var isCameraPresented = false
    @State private var isAttachmentPickerPresented = false
    @State private var isAttachmentFileImporterPresented = false
    @State private var replyingToMessage: ChatMessage?
    @State private var sendErrorMessage: String?
    @State private var isSending = false
    @State private var uploadControl: UploadControl?
    @State private var failedSendAttempt: OutgoingMessageAttempt?
    @State private var realtimeSubscription: AppwriteRealtimeSubscription?
    @State private var realtimeReloadTask: Task<Void, Never>?
    @State private var reconciliationPollingTask: Task<Void, Never>?
    @State private var animatingMessageIDs: Set<UUID> = []
    @State private var activeReplySwipeMessageID: UUID?
    @State private var activeReplySwipeOffset: CGFloat = 0
    @State private var attachmentPreview: ChatAttachmentPreview?
    @State private var isLoadingAttachmentPreview = false
    @State private var scrollViewportHeight: CGFloat = 0
    @State private var bottomAnchorMinY: CGFloat = 0
    @State private var pendingRelationshipAction: PendingRelationshipAction?
    @State private var messageReadInfoMessage: ChatMessage?
    @State private var avatarPreview: AvatarPreview?
    @State private var keyboardOverlap: CGFloat = 0
    @State private var localAudioDataByFileId: [String: Data] = [:]
    @State private var localAttachmentDataByFileId: [String: Data] = [:]
    @FocusState private var isInputFocused: Bool
    @StateObject private var audioPlayback = ChatAudioPlaybackController()
    @StateObject private var voiceRecorder = ChatVoiceRecorder()

    init(thread: ChatThread) {
        self.thread = thread
        _threadName = State(initialValue: thread.name)
        _threadAvatar = State(initialValue: thread.avatar)
        _threadIsOnline = State(initialValue: thread.isOnline)
        _otherParticipantReadAt = State(initialValue: thread.otherParticipantReadAt)
        _threadNotificationsEnabled = State(initialValue: thread.notificationsEnabled)
        _relationshipState = State(initialValue: thread.relationshipState)
        _messages = State(initialValue: thread.messages)
        _olderMessagesCursor = State(initialValue: thread.olderMessagesCursor)
        _latestHistoryAnchor = State(initialValue: thread.messages.last(where: { !$0.remoteId.hasPrefix("local-") }))
    }

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        if olderMessagesCursor != nil {
                            historyLoadControl
                        }
                        ForEach(Array(messages.enumerated()), id: \.element.id) { index, message in
                            messageRow(message, at: index)
                                .id(message.id)
                                .background {
                                    GeometryReader { geometry in
                                        Color.clear.preference(
                                            key: ChatMessageFramesPreferenceKey.self,
                                            value: [message.id: geometry.frame(in: .named("chatScrollView"))]
                                        )
                                    }
                                }
                        }
                    }
                    .padding(.top, messageListTopInset)
                    .padding(.bottom, messageListBottomInset)

                    Color.clear
                        .frame(height: 1)
                        .background(ChatBottomAnchorReader())
                }
                .onPreferenceChange(ChatMessageFramesPreferenceKey.self) { frames in
                    visibleMessageID = frames.filter { $0.value.maxY > 0 && $0.value.minY < scrollViewportHeight }
                        .min { $0.value.minY < $1.value.minY }?.key
                    if isHistoryScrollReady, !historyLoadFailed,
                       let firstID = messages.first?.id, let frame = frames[firstID],
                       frame.minY >= 0, frame.minY < 180 {
                        loadOlderMessages()
                    }
                }
                .onChange(of: historyScrollRestoreID) { _, id in
                    guard let id else { return }
                    Task { @MainActor in
                        await Task.yield()
                        proxy.scrollTo(id, anchor: .top)
                        historyScrollRestoreID = nil
                    }
                }
                .coordinateSpace(name: "chatScrollView")
                .background(ChatScrollViewportHeightReader())
                .onPreferenceChange(ChatScrollViewportHeightPreferenceKey.self) { value in
                    guard abs(scrollViewportHeight - value) > 0.5 else { return }
                    scrollViewportHeight = value
                }
                .onPreferenceChange(ChatBottomAnchorMinYPreferenceKey.self) { value in
                    guard abs(bottomAnchorMinY - value) > 0.5 else { return }
                    bottomAnchorMinY = value
                }
                .transaction { if reduceMotion { $0.animation = nil; $0.disablesAnimations = true } }
        .onAppear {
                    scrollToLatestMessage(using: proxy, animated: false)
                    settleInitialScroll(using: proxy)
                    markThreadAsRead()
                }
                .onChange(of: messages.last?.id, initial: false) {
                    // Only auto-scroll when the user is already at (or near) the bottom.
                    // If the user has scrolled up to read older messages, respect that and
                    // show the "scroll to latest" affordance instead.
                    if !showsScrollToLatestButton {
                        scrollToLatestMessage(using: proxy, animated: true)
                        markThreadAsRead()
                    }
                }
                .overlay(alignment: .bottomTrailing) {
                    if showsScrollToLatestButton {
                        Button {
                            scrollToLatestMessage(using: proxy, animated: true)
                        } label: {
                            Image(systemName: "chevron.down")
                                .font(.subheadline.weight(.bold))
                                .foregroundStyle(scrollToLatestButtonForeground)
                                .frame(width: 34, height: 34)
                                .background {
                                    scrollToLatestButtonChrome
                                }
                        }
                        .buttonStyle(.plain)
                        .padding(.trailing, 16)
                        .padding(.bottom, scrollToLatestButtonBottomPadding)
                        .transition(.scale(scale: 0.92).combined(with: .opacity))
                    }
                }
                .animation(.spring(response: 0.28, dampingFraction: 0.86), value: showsScrollToLatestButton)
            }
        }
        .scrollDismissesKeyboard(.interactively)
        .background {
            activeChatBackground
                .ignoresSafeArea()
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            if !usesModernChatChrome {
                chatHeaderOverlay
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if usesModernChatChrome {
                composerOverlay
            } else {
                composerChromeOverlay
            }
        }
        .navigationTitle(navigationTitleText)
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar(usesModernChatChrome ? .visible : .hidden, for: .navigationBar)
        .modifier(ChatDetailTabBarHidingModifier())
        .toolbar {
            if usesModernChatChrome {
                ToolbarItem(placement: .topBarLeading) {
                    chatHeaderBackButton
                }

                ToolbarItem(placement: .principal) {
                    chatHeaderPrincipal
                }

                ToolbarItem(placement: .topBarTrailing) {
                    chatHeaderTrailingMenu
                }
            }
        }
        .task {
            await reloadThread()
            startRealtime()
        }
        .task(id: scenePhase) {
            if scenePhase == .active { startReconciliationPolling() }
            else { stopReconciliationPolling() }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillChangeFrameNotification)) { notification in
            updateKeyboardOverlap(from: notification)
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { notification in
            updateKeyboardOverlap(from: notification)
        }
        .task(id: pickedAttachmentItem) {
            guard let pickedAttachmentItem else { return }
            await loadPendingAttachment(from: pickedAttachmentItem)
            await MainActor.run {
                self.pickedAttachmentItem = nil
            }
        }
        .photosPicker(
            isPresented: $isAttachmentPickerPresented,
            selection: $pickedAttachmentItem,
            matching: attachmentPickerMode.filter
        )
        .fullScreenCover(isPresented: $isCameraPresented) {
            CameraCaptureView { image in
                handleCapturedImage(image)
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .fyreRealtimeDidReconnect)) { _ in
            scheduleRealtimeReload()
        }
        .onDisappear {
            stopRealtime()
            stopReconciliationPolling()
            audioPlayback.stop()
            voiceRecorder.cancel()
        }
        .fileImporter(
            isPresented: $isAttachmentFileImporterPresented,
            allowedContentTypes: PendingChatAttachment.importerContentTypes
        ) { result in
            handleAttachmentFileSelection(result)
        }
        .sheet(item: $attachmentPreview) { preview in
            ChatAttachmentPreviewSheet(preview: preview)
                .onDisappear {
                    preview.removeOwnedTemporaryFile()
                }
        }
        .sheet(item: $messageReadInfoMessage) { message in
            MessageReadInfoSheet(
                message: message,
                readAt: readTimestamp(for: message)
            )
        }
        .sheet(item: $avatarPreview) { preview in
            ChatAvatarPreviewSheet(name: preview.name, avatarKey: preview.avatarKey)
        }
        .alert(item: $pendingRelationshipAction) { pending in
            Alert(
                title: Text(confirmTitle(for: pending.action)),
                message: Text(String(format: confirmMessage(for: pending.action), threadName)),
                primaryButton: .destructive(Text(confirmButtonTitle(for: pending.action))) {
                    applyRelationshipAction(pending.action)
                },
                secondaryButton: .cancel(Text(L10n.tr("common.cancel")))
            )
        }
    }

    @ViewBuilder
    private func messageRow(_ message: ChatMessage, at index: Int) -> some View {
        let bubblePosition = bubblePosition(for: index)
        let bubbleHorizontalPadding = bubbleHorizontalPadding(for: message)
        let bubbleVerticalPadding = bubbleVerticalPadding(for: message)
        let messageAlignment: HorizontalAlignment = message.isMe ? .trailing : .leading
        let messageTransitionAnchor: UnitPoint = message.isMe ? .trailing : .leading

        VStack(spacing: 0) {
            if shouldShowDateSeparator(before: index) {
                Text(dateSeparatorLabel(for: message.sentAt))
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 7)
                    .background(.ultraThinMaterial, in: Capsule())
                    .padding(.top, index == 0 ? 0 : 14)
                    .padding(.bottom, 10)
                    .frame(maxWidth: .infinity)
            }

            HStack(alignment: .bottom, spacing: 0) {
                if message.isMe { Spacer(minLength: 40) }

                VStack(alignment: messageAlignment, spacing: 3) {
                    messageBubbleBlock(
                        for: message,
                        at: index,
                        bubblePosition: bubblePosition,
                        bubbleHorizontalPadding: bubbleHorizontalPadding,
                        bubbleVerticalPadding: bubbleVerticalPadding
                    )
                }
                .scaleEffect(
                    isAnimating(message) ? 0.94 : 1,
                    anchor: messageTransitionAnchor
                )
                .opacity(isAnimating(message) ? 0.78 : 1)
                .offset(
                    x: isAnimating(message) ? (message.isMe ? 18 : -18) : 0,
                    y: isAnimating(message) ? 10 : 0
                )
                .blur(radius: isAnimating(message) ? 5 : 0)
                .transition(messageInsertionTransition(isOutgoing: message.isMe))
                .animation(
                    .spring(response: 0.38, dampingFraction: 0.84, blendDuration: 0.14),
                    value: animatingMessageIDs
                )
                if !message.isMe { Spacer(minLength: 40) }
            }
        }
        .frame(maxWidth: .infinity, alignment: message.isMe ? .trailing : .leading)
        .padding(.horizontal, 12)
        .padding(.top, topSpacing(for: index))
        .padding(.bottom, bottomSpacing(for: index))
        .offset(x: replySwipeOffset(for: message))
        .simultaneousGesture(replySwipeGesture(for: message))
    }

    private var chatHeaderBackButton: some View {
        Button {
            dismiss()
        } label: {
            legacyHeaderControlLabel(
                systemImage: "chevron.backward",
                verticalOffset: 0
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(L10n.tr("common.back"))
    }

    private var chatHeaderPrincipal: some View {
        HStack(spacing: 8) {
            Button {
                avatarPreview = AvatarPreview(name: threadName, avatarKey: threadAvatar)
            } label: {
                ChatAvatarView(
                    name: threadName,
                    avatarKey: threadAvatar,
                    size: 30,
                    isOnline: threadIsOnline,
                    showsPresence: false
                )
            }
            .buttonStyle(.plain)
            .accessibilityLabel(L10n.tr("chat.accessibility.avatar"))

            VStack(alignment: .leading, spacing: 1) {
                Text(threadName)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)

                if threadIsOnline {
                    Text(L10n.tr("messages.online"))
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(Color.green)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var chatHeaderTrailingMenu: some View {
        Menu {
            Button {
                setThreadNotifications(enabled: !threadNotificationsEnabled)
            } label: {
                relationshipMenuActionLabel(
                    title: threadNotificationsEnabled
                        ? L10n.tr("messages.mute.action")
                        : L10n.tr("messages.unmute.action"),
                    systemImage: threadNotificationsEnabled ? "bell.slash" : "bell",
                    textColor: .white,
                    iconColor: .orange
                )
            }

            Button {
                pendingRelationshipAction = PendingRelationshipAction(action: .unmatch)
            } label: {
                relationshipMenuActionLabel(
                    title: L10n.tr("messages.unmatch.action"),
                    systemImage: "heart.slash",
                    textColor: .red,
                    iconColor: .red
                )
            }
        } label: {
            legacyHeaderControlLabel(
                systemImage: "ellipsis",
                verticalOffset: usesIOS18LegacyChatChrome ? -0.5 : 0
            )
        }
        .accessibilityLabel(L10n.tr("chat.accessibility.options"))
    }

    private func legacyHeaderControlLabel(
        systemImage: String,
        verticalOffset: CGFloat
    ) -> some View {
        Image(systemName: systemImage)
            .font(legacyHeaderControlFont)
            .symbolRenderingMode(.monochrome)
            .foregroundStyle(legacyHeaderActionTint)
            .frame(
                width: legacyHeaderControlGlyphSize,
                height: legacyHeaderControlGlyphSize,
                alignment: .center
            )
            .offset(y: verticalOffset)
            .modifier(LegacyHeaderButtonFrameModifier(isLegacy: !usesModernChatChrome))
    }

    private func relationshipMenuActionLabel(
        title: String,
        systemImage: String,
        textColor: Color,
        iconColor: Color
    ) -> some View {
        HStack(spacing: 12) {
            Text(title)
                .foregroundStyle(textColor)

            Spacer(minLength: 0)

            Image(systemName: systemImage)
                .foregroundStyle(iconColor)
        }
        .symbolRenderingMode(.monochrome)
        .contentShape(Rectangle())
    }

    @ViewBuilder
    private var chatHeaderOverlay: some View {
        Group {
            if usesModernChatChrome {
                modernChatHeaderOverlay
            } else {
                legacyChatHeaderOverlay
            }
        }
    }

    @ViewBuilder
    private var composerChromeOverlay: some View {
        Group {
            if usesModernChatChrome {
                modernComposerChromeOverlay
            } else {
                legacyComposerChromeOverlay
            }
        }
    }

    @ViewBuilder
    private var composerOverlay: some View {
        Group {
            if usesModernChatChrome {
                modernComposerOverlay
            } else {
                legacyComposerOverlay
            }
        }
        .contentShape(Rectangle())
        .onTapGesture {
            if !hasPendingAudioAttachment {
                isInputFocused = true
            }
        }
        .simultaneousGesture(composerFocusDragGesture)
    }

    private var composerFocusDragGesture: some Gesture {
        DragGesture(minimumDistance: 12)
            .onEnded { value in
                guard abs(value.translation.height) > abs(value.translation.width) else { return }

                if value.translation.height <= -24 {
                    isInputFocused = true
                } else if value.translation.height >= 24 {
                    isInputFocused = false
                }
            }
    }

    private func sendMessage() {
        let attachment = pendingAttachment
        let sendsVoiceOnlyMessage = attachment?.type == .audio
        let text = sendsVoiceOnlyMessage ? "" : draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard canSendMessage else { return }
        audioPlayback.stop()
        let replyTarget = replyingToMessage
        let transfer = UploadControl()
        uploadControl = transfer
        let attempt = OutgoingMessageAttempt(
            draft: OutgoingMessageDraft(text: text, replyToMessageId: replyTarget?.remoteId, attachment: attachment?.outgoingAttachment),
            retrying: failedSendAttempt, uploadControl: transfer
        )
        let optimisticMessageID = attempt.operationId
        let optimisticMessage = makeOptimisticOutgoingMessage(
            id: optimisticMessageID,
            text: text,
            replyTarget: replyTarget,
            attachment: pendingAttachment
        )
        // Clear optimistically for a snappy composer, then restore the draft if the send fails.
        if let fileId = optimisticMessage.attachment?.fileId,
           let attachmentData = attachment?.data {
            localAttachmentDataByFileId[fileId] = attachmentData
            if attachment?.type == .audio {
                localAudioDataByFileId[fileId] = attachmentData
            }
        }
        draft = ""
        pendingAttachment = nil
        sendErrorMessage = nil
        isSending = true
        upsertMessage(optimisticMessage)
        replyingToMessage = nil

        let session = UserStore.shared.sessionRevision
        Task {
            do {
                let dto = try await services.backend.sendMessage(
                    threadId: thread.remoteId,
                    attempt: attempt
                )
                let message = ChatMessage(
                    id: dto.id,
                    remoteId: dto.remoteId,
                    text: dto.text,
                    messageType: dto.messageType,
                    attachment: dto.attachment,
                    isMe: dto.isMe,
                    time: dto.time,
                    sentAt: dto.sentAt,
                    replyToRemoteId: dto.replyToRemoteId,
                    replyPreviewText: dto.replyPreviewText ?? replyTarget.map(replyPreviewText(for:))
                )
                await MainActor.run {
                    guard session == UserStore.shared.sessionRevision else { return }
                    failedSendAttempt = nil
                    reconcileOptimisticMessage(id: optimisticMessageID, with: message)
                    let snapshot = currentThreadSnapshot
                    RecentChatThreadStore.upsert(snapshot)
                    NotificationCenter.default.post(name: .fyreThreadsDidChange, object: snapshot)
                    uploadControl = nil
                    isSending = false
                }
            } catch {
                await MainActor.run {
                    guard session == UserStore.shared.sessionRevision else { return }
                    failedSendAttempt = attempt
                    messages.removeAll { $0.id == optimisticMessageID }
                    if let fileId = optimisticMessage.attachment?.fileId {
                        localAudioDataByFileId.removeValue(forKey: fileId)
                        localAttachmentDataByFileId.removeValue(forKey: fileId)
                    }
                    draft = sendsVoiceOnlyMessage ? "" : text
                    pendingAttachment = attachment
                    replyingToMessage = replyTarget
#if DEBUG
                    sendErrorMessage = error.localizedDescription
#else
                    sendErrorMessage = L10n.tr("chat.error.sendFailed")
#endif
                    if error is CancellationError { sendErrorMessage = nil }
                    uploadControl = nil
                    isSending = false
                }
            }
        }
    }

    private func handleMicrophoneButtonTap() {
        if voiceRecorder.isRecording {
            stopVoiceRecording()
            return
        }

        Task {
            do {
                audioPlayback.stop()
                pendingAttachment = nil
                isInputFocused = false
                try await voiceRecorder.start()
                await MainActor.run {
                    sendErrorMessage = nil
                }
            } catch {
                await MainActor.run {
                    sendErrorMessage = error.localizedDescription
                }
            }
        }
    }

    private func stopVoiceRecording() {
        do {
            let attachment = try voiceRecorder.stop()
            pendingAttachment = attachment
            draft = ""
            sendErrorMessage = nil
        } catch {
            sendErrorMessage = error.localizedDescription
        }
    }

    private func cancelVoiceRecording() {
        voiceRecorder.cancel()
        sendErrorMessage = nil
    }

    private func clearPendingAttachment() {
        audioPlayback.stop()
        pendingAttachment = nil
    }

    private func makeOptimisticOutgoingMessage(
        id: UUID,
        text: String,
        replyTarget: ChatMessage?,
        attachment: PendingChatAttachment?
    ) -> ChatMessage {
        let now = Date()
        let optimisticAttachment = attachment.map {
            MessageAttachmentDTO(
                fileId: "local-\(id.uuidString)",
                name: $0.fileName,
                mimeType: $0.mimeType,
                size: $0.size,
                width: $0.width,
                height: $0.height,
                duration: $0.duration
            )
        }

        return ChatMessage(
            id: id,
            remoteId: "local-\(id.uuidString)",
            text: text,
            messageType: attachment?.type ?? .text,
            attachment: optimisticAttachment,
            isMe: true,
            time: Self.messageTimeFormatter.string(from: now),
            sentAt: now,
            replyToRemoteId: replyTarget?.remoteId,
            replyPreviewText: replyTarget.map(replyPreviewText(for:))
        )
    }

    private func reconcileOptimisticMessage(id: UUID, with confirmed: ChatMessage) {
        if let optimistic = messages.first(where: { $0.id == id }) {
            transferLocalAttachmentCache(from: optimistic, to: confirmed)
        }
        messages = ChatMessageReconciliation.confirm(confirmed, optimisticId: id, in: messages)
    }

    private func copyMessageText(_ text: String) {
        UIPasteboard.general.string = text
    }

    private var canSendMessage: Bool {
        canInteractWithThread
            && (!draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || pendingAttachment != nil)
            && !isSending
            && !voiceRecorder.isRecording
    }

    private var hasPendingAudioAttachment: Bool {
        pendingAttachment?.type == .audio
    }

    private var usesModernChatChrome: Bool {
        if #available(iOS 26.0, *) {
            return true
        }

        return false
    }

    private var composerMotionProgress: CGFloat {
        keyboardProgress
    }

    private var composerLayoutMetrics: ComposerLayoutMetrics {
        ComposerLayoutMetrics(progress: composerMotionProgress)
    }

    private var keyboardProgress: CGFloat {
        min(max(keyboardOverlap / 320, 0), 1)
    }

    private func updateKeyboardOverlap(from notification: Notification) {
        guard let endFrame = notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect else {
            return
        }

        let screenHeight = UIScreen.main.bounds.height
        let overlap = max(0, screenHeight - endFrame.minY - windowSafeAreaBottomInset)
        let duration = notification.userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double ?? 0.25
        withAnimation(.easeOut(duration: max(0.12, duration))) {
            keyboardOverlap = overlap
        }
    }

    private var windowSafeAreaBottomInset: CGFloat {
        let windowScene = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }
        let keyWindow = windowScene?.windows.first(where: \.isKeyWindow)
        return keyWindow?.safeAreaInsets.bottom ?? 0
    }

    @ViewBuilder
    private var activeChatBackground: some View {
        let selectedStyle = ChatBackgroundStyle(rawValue: chatBackgroundStyle) ?? .defaultDark
        selectedStyle.backgroundView(
            colorScheme: colorScheme,
            customGradientColors: customBackgroundGradientColors
        )
            .brightness(chatBackgroundBrightness)
    }

    @ViewBuilder
    private func composerFieldChrome(cornerRadius: CGFloat) -> some View {
        let shape = RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)

        if #available(iOS 26.0, *) {
            shape
                .fill(.clear)
                .glassEffect(in: shape)
                .overlay {
                    if shouldUseDarkComposerChrome {
                        shape
                            .fill(Color.black.opacity(modernComposerContrastOverlayOpacity))
                    }
                }
        } else {
            shape
                .fill(.regularMaterial)
                .overlay {
                    if shouldUseDarkComposerChrome {
                        shape
                            .fill(Color.black.opacity(modernComposerContrastOverlayOpacity))
                    }
                }
        }
    }

    @ViewBuilder
    private var modernChatHeaderOverlay: some View {
        chatHeaderContent
            .padding(.horizontal, 12)
            .padding(.top, 6)
            .padding(.bottom, 8)
            .background {
                modernChatHeaderBaseChrome
            }
    }

    @ViewBuilder
    private var legacyChatHeaderOverlay: some View {
        chatHeaderContent
            .padding(.horizontal, usesIOS18LegacyChatChrome ? 12 : 10)
            .padding(.top, usesIOS18LegacyChatChrome ? 5 : 4)
            .padding(.bottom, 6)
            .background {
                legacyChatHeaderBaseChrome
                    .ignoresSafeArea(.container, edges: .top)
            }
    }

    private var chatHeaderContent: some View {
        ZStack {
            chatHeaderPrincipal
                .frame(maxWidth: .infinity)
                .padding(.horizontal, usesModernChatChrome ? 64 : legacyHeaderPrincipalHorizontalPadding)

            HStack(spacing: 0) {
                chatHeaderBackButton
                Spacer(minLength: 0)
                chatHeaderTrailingMenu
            }
        }
    }

    @ViewBuilder
    private var modernChatHeaderBaseChrome: some View {
        Rectangle()
            .fill(.regularMaterial)
            .overlay(alignment: .bottom) {
                Rectangle()
                    .fill(colorScheme == .dark ? .white.opacity(0.10) : .black.opacity(0.08))
                    .frame(height: 0.8)
            }
    }

    @ViewBuilder
    private var legacyChatHeaderBaseChrome: some View {
        if usesIOS18LegacyChatChrome {
            legacyIOS18KeyboardChrome
                .overlay(alignment: .bottom) {
                    Rectangle()
                        .fill(legacyBarDividerColor)
                        .frame(height: 0.8)
                }
        } else {
            Rectangle()
                .fill(legacyBarMaterial)
                .overlay {
                    legacyBarOverlayColor
                        .opacity(legacyBarOverlayOpacity)
                }
                .overlay(alignment: .bottom) {
                    Rectangle()
                        .fill(legacyBarDividerColor)
                        .frame(height: 0.8)
                }
                .shadow(color: legacyBarShadowColor, radius: 10, y: 2)
        }
    }

    @ViewBuilder
    private var modernComposerChromeOverlay: some View {
        composerOverlay
            .frame(maxWidth: .infinity, alignment: .bottom)
            .padding(.bottom, modernComposerBottomInset)
            .background(alignment: .bottom) {
                modernComposerBaseChrome
                    .ignoresSafeArea(.container, edges: .bottom)
            }
    }

    @ViewBuilder
    private var legacyComposerChromeOverlay: some View {
        composerOverlay
            .frame(maxWidth: .infinity, alignment: .bottom)
            .padding(.bottom, usesIOS18LegacyChatChrome ? legacyKeyboardShieldHeight : 6)
            .background(alignment: .bottom) {
                legacyComposerBaseChrome
                    .ignoresSafeArea(.container, edges: .bottom)
            }
    }

    @ViewBuilder
    private var modernComposerOverlay: some View {
        VStack(alignment: .leading, spacing: 6) {
            composerStatusAndReplyContent
            if dynamicTypeSize.isAccessibilitySize { accessibilityComposerRow }
            else { modernComposerRow }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 10)
        .padding(.top, 6)
    }

    @ViewBuilder
    private var legacyComposerOverlay: some View {
        VStack(alignment: .leading, spacing: 8) {
            composerStatusAndReplyContent
            if dynamicTypeSize.isAccessibilitySize { accessibilityComposerRow }
            else { legacyComposerRow }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, usesIOS18LegacyChatChrome ? 8 : 12)
        .padding(.top, usesIOS18LegacyChatChrome ? legacyKeyboardSurfaceInset : 6)
    }

    @ViewBuilder
    private var composerStatusAndReplyContent: some View {
        if let uploadControl, isSending { UploadProgressView(control: uploadControl) }
        if let playbackErrorMessage = audioPlayback.playbackErrorMessage {
            Text(playbackErrorMessage)
                .font(.caption)
                .foregroundStyle(.red)
                .frame(maxWidth: .infinity, alignment: .leading)
        }

        if let sendErrorMessage {
            Text(sendErrorMessage)
                .font(.caption)
                .foregroundStyle(.red)
                .frame(maxWidth: .infinity, alignment: .leading)
        }

        if let replyingToMessage {
            replyComposerPreview(replyingToMessage)
                .padding(.bottom, 1)
        }
    }

    @ViewBuilder
    private var legacyComposerBaseChrome: some View {
        if usesIOS18LegacyChatChrome {
            legacyIOS18KeyboardChrome
                .overlay(alignment: .top) {
                    Rectangle()
                        .fill(legacyBarDividerColor)
                        .frame(height: 0.8)
                }
        } else {
            Rectangle()
                .fill(legacyBarMaterial)
                .overlay {
                    legacyBarOverlayColor
                        .opacity(colorScheme == .dark ? 0.34 : 0.70)
                }
                .overlay(alignment: .top) {
                    Rectangle()
                        .fill(legacyBarDividerColor)
                        .frame(height: 0.8)
                }
                .shadow(color: legacyBarShadowColor.opacity(0.9), radius: 12, y: -1)
        }
    }

    @ViewBuilder
    private var modernComposerBaseChrome: some View {
        Rectangle()
            .fill(.regularMaterial)
            .overlay {
                if shouldUseDarkComposerChrome {
                    Rectangle()
                        .fill(Color.black.opacity(0.32))
                }
            }
            .overlay(alignment: .top) {
                Rectangle()
                    .fill(colorScheme == .dark ? .white.opacity(0.12) : .black.opacity(0.08))
                    .frame(height: 0.8)
            }
            .shadow(color: .black.opacity(colorScheme == .dark ? 0.20 : 0.08), radius: 12, y: -1)
    }

    @ViewBuilder
    private func legacyComposerFieldChrome(cornerRadius: CGFloat) -> some View {
        let shape = RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)

        if usesIOS18LegacyChatChrome {
            shape
                .fill(.clear)
                .background {
                    legacyIOS18TextFieldChrome
                        .clipShape(shape)
                }
                .overlay {
                    shape
                        .stroke(legacyComposerInsetBorderColor, lineWidth: 0.8)
                }
        } else {
            shape
                .fill(legacyComposerInsetFill)
                .overlay {
                    shape
                        .stroke(legacyComposerInsetBorderColor, lineWidth: 0.8)
                }
        }
    }

    private var legacyComposerInsetFill: Color {
        if usesIOS18LegacyChatChrome {
            return colorScheme == .dark
                ? Color(uiColor: .tertiarySystemBackground).opacity(0.90)
                : Color(uiColor: .systemBackground).opacity(0.86)
        }

        return colorScheme == .dark
            ? Color(uiColor: .tertiarySystemBackground).opacity(0.94)
            : Color(uiColor: .systemBackground).opacity(0.94)
    }

    private var legacyComposerInsetBorderColor: Color {
        if usesIOS18LegacyChatChrome {
            return colorScheme == .dark ? .white.opacity(0.08) : .black.opacity(0.05)
        }

        return colorScheme == .dark ? .white.opacity(0.10) : .black.opacity(0.06)
    }

    @ViewBuilder
    private func legacySideButtonChrome(isDisabled: Bool = false) -> some View {
        let shape = Circle()

        shape
            .fill(legacyComposerInsetFill.opacity(isDisabled ? 0.72 : 1))
            .overlay {
                shape
                    .stroke(legacyComposerInsetBorderColor.opacity(isDisabled ? 0.72 : 1), lineWidth: 0.8)
            }
    }

    @ViewBuilder
    private func modernSideButtonChrome(isDisabled: Bool = false) -> some View {
        let shape = Circle()

        Group {
            if #available(iOS 26.0, *) {
                shape
                    .fill(.clear)
                    .glassEffect(in: shape)
                    .overlay {
                        if shouldUseDarkComposerChrome {
                            shape
                                .fill(Color.black.opacity(modernComposerContrastOverlayOpacity))
                        }
                    }
            } else {
                shape
                    .fill(.regularMaterial)
                    .overlay {
                        if shouldUseDarkComposerChrome {
                            shape
                                .fill(Color.black.opacity(modernComposerContrastOverlayOpacity))
                        }
                    }
            }
        }
        .overlay {
            shape
                .stroke(
                    colorScheme == .dark ? .white.opacity(isDisabled ? 0.08 : 0.12) : .black.opacity(isDisabled ? 0.05 : 0.08),
                    lineWidth: 0.9
                )
        }
        .opacity(isDisabled ? 0.72 : 1)
    }

    private var recordingComposerStatusView: some View {
        HStack(spacing: 10) {
            Circle()
                .fill(.red)
                .frame(width: 10, height: 10)
                .scaleEffect(voiceRecorder.isRecording ? 1 : 0.8)
                .animation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true), value: voiceRecorder.isRecording)

            Text(L10n.tr("chat.voice.recording"))
                .font(.body.weight(.medium))
                .foregroundStyle(.primary)
                .lineLimit(1)

            Spacer(minLength: 0)

            Text(voiceRecorder.elapsedDurationLabel)
                .font(.callout.monospacedDigit().weight(.semibold))
                .foregroundStyle(.secondary)

            Button {
                cancelVoiceRecording()
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.title3)
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(L10n.tr("chat.accessibility.deleteRecording"))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func microphoneInlineButton(size: CGFloat, foreground: Color) -> some View {
        Button(action: handleMicrophoneButtonTap) {
            Image(systemName: "mic.fill")
                .font(.system(size: min(22, size * 0.65), weight: .semibold))
                .foregroundStyle(foreground)
                .frame(width: size, height: size)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(L10n.tr("chat.accessibility.record"))
        .disabled(isSending || pendingAttachment != nil)
    }

    private func voiceRecordingStopButton(size: CGFloat) -> some View {
        Button(action: stopVoiceRecording) {
            Image(systemName: "stop.fill")
                .font(.system(size: max(14, size * 0.36), weight: .bold))
                .foregroundStyle(.white)
                .frame(width: size, height: size)
                .background {
                    Circle()
                        .fill(.red)
                        .shadow(color: .red.opacity(colorScheme == .dark ? 0.34 : 0.24), radius: 8, y: 3)
                }
                .overlay {
                    Circle()
                        .stroke(.white.opacity(0.22), lineWidth: 1)
                }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(L10n.tr("chat.accessibility.stopRecording"))
        .disabled(isSending)
    }

    private var messageListTopInset: CGFloat {
        0
    }

    private var messageListBottomInset: CGFloat {
        10
    }

    private var messageMaxWidth: CGFloat {
        UIScreen.main.bounds.width * (dynamicTypeSize.isAccessibilitySize ? 0.92 : 0.72)
    }

    private var showsScrollToLatestButton: Bool {
        guard messages.count > 1, scrollViewportHeight > 0 else {
            return false
        }

        return bottomAnchorMinY > (scrollViewportHeight + 120)
    }

    private var scrollToLatestButtonBottomPadding: CGFloat {
        18
    }

    private var scrollToLatestButtonForeground: AnyShapeStyle {
        return AnyShapeStyle(colorScheme == .dark ? .white.opacity(0.92) : .primary.opacity(0.88))
    }

    @ViewBuilder
    private var scrollToLatestButtonChrome: some View {
        Circle()
            .fill(.regularMaterial)
            .overlay {
                Circle()
                    .stroke(.white.opacity(colorScheme == .dark ? 0.12 : 0.18), lineWidth: 1)
            }
            .shadow(color: .black.opacity(colorScheme == .dark ? 0.28 : 0.10), radius: 8, y: 3)
    }

    @ViewBuilder
    private func composerAttachmentButton() -> some View {
        Image(systemName: "plus")
            .font(.system(size: 20, weight: .semibold))
            .frame(width: 30, height: 30)
    }

    private var navigationTitleText: String {
        return ""
    }

    private var messageMetadataForegroundStyle: AnyShapeStyle {
        AnyShapeStyle(isLightChatBackground ? Color.black.opacity(0.82) : Color.white.opacity(0.96))
    }

    private var modernSendButtonSharedStretchProgress: CGFloat {
        min(0.18, composerLayoutMetrics.progress * 0.18)
    }

    private var accessibilityComposerRow: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let pendingAttachment { composerIntegratedAttachmentPreview(pendingAttachment) }
            if voiceRecorder.isRecording {
                recordingComposerStatusView
            } else if !hasPendingAudioAttachment {
                TextField(L10n.tr("chat.message.placeholder"), text: $draft, axis: .vertical)
                    .accessibilityIdentifier("chat.composer")
                    .focused($isInputFocused)
                    .textFieldStyle(.plain)
                    .submitLabel(.send)
                    .onSubmit(sendMessage)
                    .lineLimit(1...3)
                    .padding(10)
                    .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
            }
            HStack {
                Menu { attachmentMenuActions } label: {
                    Image(systemName: "plus").font(.system(size: 22, weight: .semibold))
                        .frame(width: 44, height: 44)
                }
                .accessibilityLabel(L10n.tr("chat.accessibility.attach"))
                Spacer(minLength: 8)
                if voiceRecorder.isRecording { voiceRecordingStopButton(size: 44) }
                else {
                    microphoneInlineButton(size: 44, foreground: .primary)
                    LiquidStretchSendButton(isEnabled: canSendMessage, action: sendMessage, size: 44,
                                            gradientColors: sendButtonGradientColors, allowsLiquidInteraction: false)
                }
            }
        }
        .padding(4)
        .background(Color(uiColor: .systemBackground), in: RoundedRectangle(cornerRadius: 14))
    }

    @ViewBuilder
    private var modernComposerRow: some View {
        let metrics = composerLayoutMetrics

        HStack(alignment: .center, spacing: metrics.sideSpacing) {
            Menu {
                attachmentMenuActions
            } label: {
                composerAttachmentButton()
                    .foregroundStyle(colorScheme == .dark ? .white.opacity(0.92) : .primary.opacity(0.84))
                    .frame(width: metrics.sideButtonSize, height: metrics.sideButtonSize)
                    .background(modernSideButtonChrome())
            }
            .buttonStyle(.plain)
            .tint(.primary)
            .scaleEffect(metrics.sideButtonScale)
            .frame(height: metrics.fieldMinHeight, alignment: .center)

            HStack(alignment: .center, spacing: 8) {
                if let pendingAttachment {
                    composerIntegratedAttachmentPreview(pendingAttachment)
                }

                if voiceRecorder.isRecording {
                    recordingComposerStatusView
                } else if hasPendingAudioAttachment {
                    Spacer(minLength: 0)
                } else {
                    TextField(L10n.tr("chat.message.placeholder"), text: $draft, axis: .vertical)
                        .accessibilityIdentifier("chat.composer")
                        .foregroundStyle(shouldUseDarkComposerChrome ? Color.white : Color.primary)
                        .focused($isInputFocused)
                        .textFieldStyle(.plain)
                        .submitLabel(.send)
                        .onSubmit(sendMessage)
                        .lineLimit(1...4)
                }

                if !voiceRecorder.isRecording {
                    microphoneInlineButton(
                        size: metrics.inlineAccessorySize,
                        foreground: composerSecondaryForegroundColor
                    )
                }
            }
            .padding(.horizontal, metrics.fieldHorizontalPadding)
            .padding(.vertical, metrics.fieldVerticalPadding)
            .background(composerFieldChrome(cornerRadius: metrics.fieldCornerRadius))
            .frame(maxWidth: .infinity, minHeight: metrics.fieldMinHeight, alignment: .leading)

            if voiceRecorder.isRecording {
                voiceRecordingStopButton(size: metrics.sendButtonSize)
                    .frame(width: metrics.sendButtonSize, height: metrics.sendButtonSize, alignment: .center)
                    .frame(height: metrics.fieldMinHeight, alignment: .center)
            } else {
                LiquidStretchSendButton(
                    isEnabled: canSendMessage,
                    action: sendMessage,
                    size: metrics.sendButtonSize,
                    gradientColors: sendButtonGradientColors,
                    allowsLiquidInteraction: true,
                    sharedStretchProgress: modernSendButtonSharedStretchProgress,
                    contrastBoost: isLightChatBackground
                )
                .frame(width: metrics.sendButtonSize, height: metrics.sendButtonSize, alignment: .center)
                .frame(height: metrics.fieldMinHeight, alignment: .center)
            }
        }
        .animation(.spring(response: 0.28, dampingFraction: 0.84), value: metrics.progress)
    }

    @ViewBuilder
    private var legacyComposerRow: some View {
        HStack(alignment: .center, spacing: usesIOS18LegacyChatChrome ? 6 : 8) {
            Menu {
                attachmentMenuActions
            } label: {
                composerAttachmentButton()
                    .foregroundStyle(legacyAttachmentButtonTint)
                    .frame(width: 34, height: 34)
            }
            .buttonStyle(.plain)
            .tint(legacyAttachmentButtonTint)
            .frame(width: 34, height: 42, alignment: .center)

            HStack(alignment: .center, spacing: 8) {
                if let pendingAttachment {
                    composerIntegratedAttachmentPreview(pendingAttachment)
                }

                if voiceRecorder.isRecording {
                    recordingComposerStatusView
                } else if hasPendingAudioAttachment {
                    Spacer(minLength: 0)
                } else {
                    TextField(L10n.tr("chat.message.placeholder"), text: $draft, axis: .vertical)
                        .accessibilityIdentifier("chat.composer")
                        .foregroundStyle(.primary)
                        .focused($isInputFocused)
                        .textFieldStyle(.plain)
                        .submitLabel(.send)
                        .onSubmit(sendMessage)
                        .lineLimit(1...4)
                }

                if !voiceRecorder.isRecording {
                    microphoneInlineButton(size: 28, foreground: .secondary)
                }
            }
            .padding(.horizontal, usesIOS18LegacyChatChrome ? 13 : 14)
            .padding(.vertical, usesIOS18LegacyChatChrome ? 7 : 10)
            .background(legacyComposerFieldChrome(cornerRadius: usesIOS18LegacyChatChrome ? 20 : 23))
            .frame(maxWidth: .infinity, minHeight: usesIOS18LegacyChatChrome ? 42 : 46, alignment: .leading)

            if voiceRecorder.isRecording {
                voiceRecordingStopButton(size: usesIOS18LegacyChatChrome ? 40 : 44)
                    .frame(width: usesIOS18LegacyChatChrome ? 40 : 44, height: usesIOS18LegacyChatChrome ? 40 : 44, alignment: .center)
            } else if usesIOS18LegacyChatChrome {
                legacySendButton
                    .frame(width: 40, height: 40, alignment: .center)
            } else {
                LiquidStretchSendButton(
                    isEnabled: canSendMessage,
                    action: sendMessage,
                    size: 44,
                    gradientColors: sendButtonGradientColors,
                    allowsLiquidInteraction: false,
                    sharedStretchProgress: 0
                )
                .frame(width: 44, height: 44, alignment: .center)
            }
        }
    }

    private var legacySendButton: some View {
        Button(action: sendMessage) {
            Image(systemName: "paperplane.fill")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 38, height: 38)
                .background {
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: legacySendButtonColors,
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(L10n.tr("chat.accessibility.send"))
        .accessibilityIdentifier("chat.send")
        .disabled(!canSendMessage)
        .opacity(canSendMessage ? 1 : 0.72)
    }

    private var outgoingBubbleStyle: ChatBubblePalette {
        ChatBubblePalette(rawValue: outgoingBubblePalette) ?? .default
    }

    private var incomingBubbleStyle: ChatBubblePalette {
        ChatBubblePalette(rawValue: incomingBubblePalette) ?? .default
    }

    private var sendButtonGradientColors: [Color] {
        [
            Color(hex: sendButtonColor1Hex),
            Color(hex: sendButtonColor2Hex),
            Color(hex: sendButtonColor3Hex)
        ]
        .compactMap { $0 }
    }

    private var customBackgroundGradientColors: [Color] {
        [
            Color(hex: chatBackgroundColor1Hex),
            Color(hex: chatBackgroundColor2Hex),
            Color(hex: chatBackgroundColor3Hex)
        ]
        .compactMap { $0 }
    }

    private var isLightChatBackground: Bool {
        let selectedStyle = ChatBackgroundStyle(rawValue: chatBackgroundStyle) ?? .defaultDark

        switch selectedStyle {
        case .defaultDark:
            return colorScheme == .light
        case .graphite, .ember, .ocean, .forest:
            return colorScheme == .light
        case .customGradient:
            let colors = customBackgroundGradientColors
            guard !colors.isEmpty else {
                return colorScheme == .light
            }

            let brightestStop = colors
                .map(\.perceivedLuminance)
                .max() ?? 0
            return brightestStop >= 0.55
        }
    }

    private var shouldUseDarkComposerChrome: Bool {
        colorScheme == .dark && isLightChatBackground
    }

    private var usesIOS18LegacyChatChrome: Bool {
        guard !usesModernChatChrome else {
            return false
        }

        return ProcessInfo.processInfo.operatingSystemVersion.majorVersion == 18
    }

    private var legacyHeaderActionTint: Color {
        if usesIOS18LegacyChatChrome {
            return .white
        }

        return .primary
    }

    private var legacyHeaderControlFont: Font {
        if usesIOS18LegacyChatChrome {
            return .system(size: 18, weight: .semibold)
        }

        return .body.weight(.semibold)
    }

    private var legacyHeaderControlGlyphSize: CGFloat {
        usesIOS18LegacyChatChrome ? 18 : 20
    }

    private var legacyHeaderPrincipalHorizontalPadding: CGFloat {
        usesIOS18LegacyChatChrome ? 60 : 56
    }

    private var legacyKeyboardSurfaceInset: CGFloat {
        guard usesIOS18LegacyChatChrome else {
            return 0
        }

        return keyboardOverlap > 0 ? 12 : 8
    }

    private var legacyKeyboardShieldHeight: CGFloat {
        guard usesIOS18LegacyChatChrome, keyboardOverlap > 0 else {
            return 0
        }

        return legacyKeyboardSurfaceInset
    }

    private var legacyIOS18KeyboardTone: Color {
        Color(
            uiColor: colorScheme == .dark
                ? .tertiarySystemBackground
                : .secondarySystemGroupedBackground
        )
    }

    private var legacyIOS18KeyboardHighlightTone: Color {
        Color(
            uiColor: colorScheme == .dark
                ? .secondarySystemBackground
                : .tertiarySystemGroupedBackground
        )
    }

    private var legacyIOS18KeyboardShadowTone: Color {
        Color(
            uiColor: colorScheme == .dark
                ? .systemGray4
                : .systemGray5
        )
    }

    private var legacyIOS18KeyboardBlurStyle: UIBlurEffect.Style {
        colorScheme == .dark ? .systemChromeMaterialDark : .systemChromeMaterial
    }

    private var legacyIOS18KeyboardChrome: some View {
        VisualEffectBlurView(style: legacyIOS18KeyboardBlurStyle)
            .overlay {
                LinearGradient(
                    stops: [
                        .init(
                            color: legacyIOS18KeyboardHighlightTone.opacity(colorScheme == .dark ? 0.16 : 0.24),
                            location: 0
                        ),
                        .init(
                            color: legacyIOS18KeyboardTone.opacity(colorScheme == .dark ? 0.22 : 0.30),
                            location: 0.26
                        ),
                        .init(
                            color: legacyIOS18KeyboardTone.opacity(colorScheme == .dark ? 0.28 : 0.36),
                            location: 0.72
                        ),
                        .init(
                            color: legacyIOS18KeyboardShadowTone.opacity(colorScheme == .dark ? 0.34 : 0.42),
                            location: 1
                        )
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
            }
    }

    private var legacyIOS18TextFieldChrome: some View {
        legacyIOS18KeyboardChrome
            .overlay {
                LinearGradient(
                    stops: [
                        .init(
                            color: Color.white.opacity(colorScheme == .dark ? 0.03 : 0.06),
                            location: 0
                        ),
                        .init(
                            color: Color.black.opacity(colorScheme == .dark ? 0.16 : 0.22),
                            location: 0.55
                        ),
                        .init(
                            color: Color.black.opacity(colorScheme == .dark ? 0.22 : 0.28),
                            location: 1
                        )
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
            }
    }

    private var legacyAttachmentButtonTint: Color {
        usesIOS18LegacyChatChrome ? .white : Color(uiColor: .systemBlue)
    }

    private var legacyBarMaterial: Material {
        usesIOS18LegacyChatChrome ? .bar : .regularMaterial
    }

    private var legacyBarOverlayColor: Color {
        if usesIOS18LegacyChatChrome {
            return Color(
                uiColor: colorScheme == .dark
                    ? .secondarySystemBackground
                    : .secondarySystemGroupedBackground
            )
        }

        return Color(uiColor: colorScheme == .dark ? .black : .systemBackground)
    }

    private var legacyBarOverlayOpacity: CGFloat {
        if usesIOS18LegacyChatChrome {
            return colorScheme == .dark ? 0.84 : 0.92
        }

        return colorScheme == .dark ? 0.30 : 0.62
    }

    private var legacyBarDividerColor: Color {
        if usesIOS18LegacyChatChrome {
            return colorScheme == .dark ? .white.opacity(0.08) : .black.opacity(0.05)
        }

        return colorScheme == .dark ? .white.opacity(0.10) : .black.opacity(0.06)
    }

    private var legacyBarShadowColor: Color {
        if usesIOS18LegacyChatChrome {
            return .clear
        }

        return .black.opacity(colorScheme == .dark ? 0.20 : 0.06)
    }

    private var modernComposerContrastOverlayOpacity: CGFloat {
        0.32
    }

    private var modernComposerBottomInset: CGFloat {
        if keyboardOverlap > 0 {
            return 20
        }

        return max(6, windowSafeAreaBottomInset)
    }

    private var legacySendButtonFill: Color {
        canSendMessage
            ? Color(uiColor: .systemBlue)
            : Color(uiColor: colorScheme == .dark ? .tertiarySystemFill : .quaternarySystemFill)
    }

    private var legacySendButtonColors: [Color] {
        if canSendMessage, !sendButtonGradientColors.isEmpty {
            return sendButtonGradientColors
        }

        return [legacySendButtonFill, legacySendButtonFill]
    }

    private var composerSecondaryForegroundColor: Color {
        shouldUseDarkComposerChrome ? .white.opacity(0.78) : .secondary
    }

    private func messageTextStyle(isOutgoing: Bool) -> AnyShapeStyle {
        AnyShapeStyle(messageTextColor(isOutgoing: isOutgoing))
    }

    private func messageTextColor(isOutgoing: Bool) -> Color {
        let palette = isOutgoing ? outgoingBubbleStyle : incomingBubbleStyle
        return palette.textColor(colorScheme: colorScheme, isOutgoing: isOutgoing)
    }

    private func messageLinkColor(isOutgoing: Bool) -> Color {
        messageTextColor(isOutgoing: isOutgoing)
    }

    private func attributedMessageText(_ text: String, isOutgoing: Bool) -> AttributedString {
        var attributed = AttributedString(text)
        attributed.foregroundColor = messageTextColor(isOutgoing: isOutgoing)

        guard let detector = Self.messageLinkDetector else {
            return attributed
        }

        let nsRange = NSRange(text.startIndex..<text.endIndex, in: text)
        let matches = detector.matches(in: text, options: [], range: nsRange)
        for match in matches {
            guard
                let stringRange = Range(match.range, in: text),
                let attributedRange = Range(stringRange, in: attributed),
                let url = normalizedMessageURL(for: String(text[stringRange]), detectedURL: match.url)
            else {
                continue
            }

            attributed[attributedRange].link = url
            attributed[attributedRange].foregroundColor = messageLinkColor(isOutgoing: isOutgoing)
            attributed[attributedRange].underlineStyle = .single
        }

        return attributed
    }

    private func normalizedMessageURL(for text: String, detectedURL: URL?) -> URL? {
        let trimmed = text.trimmingCharacters(in: CharacterSet(charactersIn: ".,!?;:)"))
        guard !trimmed.isEmpty else { return nil }

        let candidate = detectedURL ?? URL(string: trimmed)
        if let candidate,
           let scheme = candidate.scheme?.lowercased(),
           ["http", "https", "mailto", "tel"].contains(scheme) {
            return candidate
        }

        return URL(string: "https://\(trimmed)")
    }

    @ViewBuilder
    private func messageBubbleBlock(
        for message: ChatMessage,
        at index: Int,
        bubblePosition: MessageBubblePosition,
        bubbleHorizontalPadding: CGFloat,
        bubbleVerticalPadding: CGFloat
    ) -> some View {
        let isImageOnly = isImageOnlyMessage(message)
        let bubbleMaxWidth = isImageOnly ? min(messageMaxWidth + 24, 292) : messageMaxWidth
        let bubbleShadowColor: Color = isImageOnly
            ? .black.opacity(colorScheme == .dark ? 0.26 : 0.12)
            : messageBubbleShadow(isOutgoing: message.isMe)
        let bubbleShadowRadius: CGFloat = isImageOnly ? 12 : (colorScheme == .dark ? 0 : 6)
        let bubbleShadowY: CGFloat = isImageOnly ? 6 : (colorScheme == .dark ? 0 : 3)

        messageBubblePayload(for: message)
            .padding(.horizontal, isImageOnly ? 0 : bubbleHorizontalPadding)
            .padding(.vertical, isImageOnly ? 0 : bubbleVerticalPadding)
            .background {
                if !isImageOnly {
                    messageBubbleChrome(
                        isOutgoing: message.isMe,
                        position: bubblePosition
                    )
                }
            }
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: bubbleMaxWidth, alignment: message.isMe ? .trailing : .leading)
            .shadow(color: bubbleShadowColor, radius: bubbleShadowRadius, y: bubbleShadowY)
            .contextMenu {
                Button {
                    replyingToMessage = message
                    isInputFocused = true
                } label: {
                    Label(L10n.tr("chat.reply"), systemImage: "arrowshape.turn.up.left.fill")
                }

                Button {
                    copyMessageText(message.text)
                } label: {
                    Label(L10n.tr("chat.copy"), systemImage: "doc.on.doc")
                }
            }

        if shouldShowMetadata(for: index) {
            messageMetadataView(message: message, index: index)
        }
    }

    @ViewBuilder
    private func messageBubblePayload(for message: ChatMessage) -> some View {
        if isImageOnlyMessage(message) {
            if let attachment = message.attachment {
                messageAttachmentView(
                    attachment: attachment,
                    messageType: message.messageType,
                    isEmbeddedInBubble: false
                )
            }
        } else {
            messageBubbleTextAndAttachmentStack(for: message)
        }
    }

    @ViewBuilder
    private func messageBubbleTextAndAttachmentStack(for message: ChatMessage) -> some View {
        VStack(alignment: .leading, spacing: contentStackSpacing(for: message)) {
            if let replyPreviewText = message.replyPreviewText {
                replyInlinePreview(
                    sender: replySenderLabel(for: message),
                    text: replyPreviewText,
                    isOutgoing: message.isMe
                )
            }

            if let attachment = message.attachment {
                messageAttachmentView(
                    attachment: attachment,
                    messageType: message.messageType,
                    isEmbeddedInBubble: true
                )
            }

            if !message.text.isEmpty {
                Text(attributedMessageText(message.text, isOutgoing: message.isMe))
                    .font(.body)
                    .multilineTextAlignment(.leading)
            }
        }
    }

    private func messageBubbleBackground(isOutgoing: Bool) -> AnyShapeStyle {
        let palette = isOutgoing ? outgoingBubbleStyle : incomingBubbleStyle
        return palette.fillStyle(colorScheme: colorScheme, isOutgoing: isOutgoing)
    }

    @ViewBuilder
    private func messageBubbleChrome(isOutgoing: Bool, position: MessageBubblePosition) -> some View {
        MessageBubbleShape(isOutgoing: isOutgoing, position: position, cornerRadius: bubbleCornerRadius)
            .fill(messageBubbleBackground(isOutgoing: isOutgoing))
            .overlay {
                MessageBubbleShape(isOutgoing: isOutgoing, position: position, cornerRadius: bubbleCornerRadius)
                    .stroke(messageBubbleStroke(isOutgoing: isOutgoing), lineWidth: 1)
            }
    }

    private var bubbleCornerRadius: CGFloat {
        18
    }

    private func messageBubbleStroke(isOutgoing: Bool) -> Color {
        let palette = isOutgoing ? outgoingBubbleStyle : incomingBubbleStyle
        return palette.strokeColor(colorScheme: colorScheme, isOutgoing: isOutgoing)
    }

    private func messageBubbleShadow(isOutgoing: Bool) -> Color {
        guard colorScheme == .light else { return .clear }
        return isOutgoing ? .orange.opacity(0.10) : .black.opacity(0.05)
    }

    private func bubbleHorizontalPadding(for message: ChatMessage) -> CGFloat {
        if isImageOnlyMessage(message) {
            return 5
        }

        if isAttachmentOnlyMessage(message) {
            return 8
        }

        return 12
    }

    private func bubbleVerticalPadding(for message: ChatMessage) -> CGFloat {
        if isImageOnlyMessage(message) {
            return 5
        }

        if isAttachmentOnlyMessage(message) {
            return 6
        }

        return 8
    }

    private func contentStackSpacing(for message: ChatMessage) -> CGFloat {
        if message.replyPreviewText != nil {
            return 8
        }

        if message.attachment != nil && !message.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return 8
        }

        return 0
    }

    private func isAttachmentOnlyMessage(_ message: ChatMessage) -> Bool {
        message.attachment != nil
            && message.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && message.replyPreviewText == nil
    }

    private func isImageOnlyMessage(_ message: ChatMessage) -> Bool {
        isAttachmentOnlyMessage(message) && message.messageType == .image
    }

    private func replyPreviewBackground(isOutgoing: Bool) -> Color {
        if isOutgoing {
            return .white.opacity(colorScheme == .dark ? 0.10 : 0.20)
        }

        return colorScheme == .dark ? .white.opacity(0.04) : .black.opacity(0.04)
    }

    private func replySenderLabel(for message: ChatMessage) -> String {
        guard let replyToRemoteId = message.replyToRemoteId,
              let referencedMessage = messages.first(where: { $0.remoteId == replyToRemoteId }) else {
            return message.isMe ? L10n.tr("chat.reply.you") : threadName
        }

        return referencedMessage.isMe ? L10n.tr("chat.reply.you") : threadName
    }

    private func replyPreviewText(for message: ChatMessage) -> String {
        let trimmed = message.text.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty {
            return trimmed
        }

        switch message.messageType {
        case .image:
            return L10n.tr("chat.attachment.photo")
        case .video:
            return L10n.tr("chat.attachment.video")
        case .audio:
            return L10n.tr("chat.attachment.audio")
        case .file:
            return message.attachment?.name ?? L10n.tr("chat.attachment.file")
        case .text:
            return ""
        }
    }

    @ViewBuilder
    private func replyInlinePreview(sender: String, text: String, isOutgoing: Bool) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(sender)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(messageTextColor(isOutgoing: isOutgoing))
                .lineLimit(1)

            Text(text)
                .font(.callout)
                .foregroundStyle(messageTextColor(isOutgoing: isOutgoing))
                .lineLimit(2)
                .multilineTextAlignment(.leading)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .background(replyInlinePreviewBackground(isOutgoing: isOutgoing))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func replyInlinePreviewBackground(isOutgoing: Bool) -> some ShapeStyle {
        if isOutgoing {
            return AnyShapeStyle(.black.opacity(0.16))
        }

        return AnyShapeStyle(
            Color(uiColor: colorScheme == .dark ? .systemGray5 : UIColor.white.withAlphaComponent(0.72))
        )
    }

    @ViewBuilder
    private func replyComposerPreview(_ message: ChatMessage) -> some View {
        HStack(spacing: 9) {
            RoundedRectangle(cornerRadius: 1.5, style: .continuous)
                .fill(replyComposerIndicatorColor)
                .frame(width: 3, height: 30)
                .padding(.vertical, 2)

            VStack(alignment: .leading, spacing: 2) {
                Text(message.isMe ? L10n.tr("chat.reply.you") : threadName)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)

                Text(replyPreviewText(for: message))
                    .font(.caption)
                    .foregroundStyle(.primary.opacity(0.82))
                    .lineLimit(1)
            }

            Spacer(minLength: 0)

            Button {
                replyingToMessage = nil
            } label: {
                Image(systemName: "xmark")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.secondary)
                    .frame(width: 24, height: 24)
                    .background(replyComposerCloseButtonChrome)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(replyComposerPreviewChrome)
    }

    private var replyComposerIndicatorColor: Color {
        Color.orange.opacity(colorScheme == .dark ? 0.62 : 0.54)
    }

    @ViewBuilder
    private var replyComposerPreviewChrome: some View {
        let shape = RoundedRectangle(cornerRadius: 16, style: .continuous)

        if usesModernChatChrome {
            shape
                .fill(modernReplyComposerFill)
                .overlay {
                    shape
                        .stroke(replyComposerBorderColor, lineWidth: 0.8)
                }
        } else {
            shape
                .fill(legacyComposerInsetFill)
                .overlay {
                    shape
                        .stroke(replyComposerBorderColor, lineWidth: 0.8)
                }
        }
    }

    @ViewBuilder
    private var replyComposerCloseButtonChrome: some View {
        let shape = Circle()

        if usesModernChatChrome {
            shape
                .fill(modernReplyComposerButtonFill)
                .overlay {
                    shape
                        .stroke(replyComposerBorderColor, lineWidth: 0.8)
                }
        } else {
            shape
                .fill(legacyComposerInsetFill)
                .overlay {
                    shape
                        .stroke(replyComposerBorderColor, lineWidth: 0.8)
                }
        }
    }

    private var replyComposerBorderColor: Color {
        if usesModernChatChrome {
            return colorScheme == .dark ? .white.opacity(0.14) : .black.opacity(0.08)
        }

        return legacyComposerInsetBorderColor
    }

    private var modernReplyComposerFill: Color {
        Color(uiColor: colorScheme == .dark ? .secondarySystemBackground : .systemBackground)
            .opacity(colorScheme == .dark ? 0.82 : 0.78)
    }

    private var modernReplyComposerButtonFill: Color {
        Color(uiColor: colorScheme == .dark ? .tertiarySystemBackground : .systemBackground)
            .opacity(colorScheme == .dark ? 0.92 : 0.9)
    }

    private func replySwipeOffset(for message: ChatMessage) -> CGFloat {
        guard activeReplySwipeMessageID == message.id else { return 0 }
        return activeReplySwipeOffset
    }

    private func replySwipeGesture(for message: ChatMessage) -> some Gesture {
        DragGesture(minimumDistance: 15, coordinateSpace: .local)
            .onChanged { value in
                guard abs(value.translation.width) > abs(value.translation.height) else { return }

                let proposedOffset: CGFloat
                if message.isMe {
                    if value.translation.width < 0 {
                        proposedOffset = max(value.translation.width * 0.32, -42)
                    } else if value.translation.width > 0 {
                        proposedOffset = min(value.translation.width * 0.32, 42)
                    } else {
                        return
                    }
                } else {
                    guard value.translation.width > 0 else { return }
                    proposedOffset = min(value.translation.width * 0.32, 42)
                }

                activeReplySwipeMessageID = message.id
                activeReplySwipeOffset = proposedOffset
            }
            .onEnded { value in
                defer {
                    withAnimation(.spring(response: 0.28, dampingFraction: 0.86)) {
                        activeReplySwipeMessageID = nil
                        activeReplySwipeOffset = 0
                    }
                }

                guard abs(value.translation.width) > abs(value.translation.height) else { return }

                if message.isMe, value.translation.width <= -54 {
                    messageReadInfoMessage = message
                } else if message.isMe, value.translation.width >= 54 {
                    replyingToMessage = message
                    isInputFocused = true
                } else if !message.isMe, value.translation.width >= 54 {
                    replyingToMessage = message
                    isInputFocused = true
                }
            }
    }

    @ViewBuilder
    private func composerIntegratedAttachmentPreview(_ attachment: PendingChatAttachment) -> some View {
        if attachment.type == .audio {
            pendingAudioAttachmentPreview(attachment)
                .padding(.trailing, 4)
        } else {
        ZStack(alignment: .topTrailing) {
            Group {
                if let previewImage = attachment.previewImage {
                    Image(uiImage: previewImage)
                        .interpolation(.high)
                        .antialiased(true)
                        .resizable()
                        .scaledToFill()
                } else {
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(.white.opacity(colorScheme == .dark ? 0.08 : 0.10))
                        .overlay {
                            Image(systemName: attachment.type == .video ? "video.fill" : "doc.fill")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.orange)
                        }
                }
            }
            .frame(width: 46, height: 46)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))

            Button {
                pendingAttachment = nil
            } label: {
                Image(systemName: "xmark")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(.white.opacity(0.92))
                    .frame(width: 20, height: 20)
                    .background(.black.opacity(0.45), in: Circle())
            }
            .buttonStyle(.plain)
            .offset(x: 6, y: -6)
        }
        .padding(.trailing, 4)
        }
    }

    @ViewBuilder
    private var attachmentMenuActions: some View {
        Button {
            attachmentPickerMode = .media
            isAttachmentPickerPresented = true
        } label: {
            Label(L10n.tr("chat.attachment.media"), systemImage: "photo")
        }

        Button {
            isAttachmentFileImporterPresented = true
        } label: {
            Label(L10n.tr("chat.attachment.file"), systemImage: "doc")
        }

        if UIImagePickerController.isSourceTypeAvailable(.camera) {
            Button {
                isCameraPresented = true
            } label: {
                Label(L10n.tr("chat.attachment.camera"), systemImage: "camera")
            }
        }
    }

    private var canInteractWithThread: Bool {
        switch relationshipState {
        case .liked, .matched:
            return true
        case .none, .archived, .blocked:
            return false
        }
    }

    private func applyRelationshipAction(_ action: RelationshipActionDTO) {
        Task {
            do {
                try await services.backend.updateRelationship(
                    threadId: thread.remoteId,
                    action: action
                )
                await MainActor.run {
                    NotificationCenter.default.post(name: .fyreThreadRemoved, object: thread.remoteId)
                    NotificationCenter.default.post(name: .fyreThreadsDidChange, object: nil)
                    dismiss()
                }
            } catch {
                await MainActor.run {
#if DEBUG
                    sendErrorMessage = error.localizedDescription
#else
                    sendErrorMessage = L10n.tr("chat.error.sendFailed")
#endif
                }
            }
        }
    }

    private func setThreadNotifications(enabled: Bool) {
        let previousValue = threadNotificationsEnabled
        threadNotificationsEnabled = enabled
        RecentChatThreadStore.upsert(currentThreadSnapshot)
        LocalNotificationCoordinator.shared.setThreadNotifications(threadId: thread.remoteId, enabled: enabled)

        Task {
            do {
                try await services.backend.updateThreadNotifications(
                    threadId: thread.remoteId,
                    enabled: enabled
                )
                await MainActor.run {
                    NotificationCenter.default.post(name: .fyreThreadsDidChange, object: nil)
                }
            } catch {
                await MainActor.run {
#if DEBUG
                    sendErrorMessage = error.localizedDescription
#else
                    sendErrorMessage = L10n.tr("chat.error.sendFailed")
#endif
                    threadNotificationsEnabled = previousValue
                    RecentChatThreadStore.upsert(currentThreadSnapshot)
                    LocalNotificationCoordinator.shared.setThreadNotifications(
                        threadId: thread.remoteId,
                        enabled: previousValue
                    )
                }
            }
        }
    }

    @ViewBuilder
    private func messageAttachmentView(
        attachment: MessageAttachmentDTO,
        messageType: MessageTypeDTO,
        isEmbeddedInBubble: Bool
    ) -> some View {
        switch messageType {
        case .image:
            let imageSize = attachmentDisplaySize(
                attachment: attachment,
                maxWidth: isEmbeddedInBubble ? max(messageMaxWidth - 24, 120) : min(messageMaxWidth + 24, 292),
                maxHeight: 292
            )

            RemoteChatAttachmentImage(
                fileId: attachment.fileId,
                localData: localAttachmentDataByFileId[attachment.fileId]
            )
            .frame(
                width: imageSize.width,
                height: imageSize.height,
                alignment: .center
            )
                .clipShape(RoundedRectangle(cornerRadius: isEmbeddedInBubble ? 16 : 22, style: .continuous))
                .overlay {
                    if !isEmbeddedInBubble {
                        RoundedRectangle(cornerRadius: 22, style: .continuous)
                            .stroke(.white.opacity(colorScheme == .dark ? 0.12 : 0.18), lineWidth: 1)
                    }
                }
                .contentShape(RoundedRectangle(cornerRadius: isEmbeddedInBubble ? 16 : 22, style: .continuous))
                .onTapGesture {
                    openAttachmentPreview(attachment, as: .image)
                }

        case .video:
            RemoteChatAttachmentVideoPreview(
                fileId: attachment.fileId,
                localData: localAttachmentDataByFileId[attachment.fileId],
                title: attachment.name,
                duration: attachment.duration
            )
            .frame(
                maxWidth: isEmbeddedInBubble ? max(messageMaxWidth - 24, 180) : min(messageMaxWidth + 24, 292),
                maxHeight: 292
            )
            .clipShape(RoundedRectangle(cornerRadius: isEmbeddedInBubble ? 16 : 22, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .onTapGesture {
                openAttachmentPreview(attachment, as: .video)
            }

        case .audio:
            let playbackKey = remoteAudioPlaybackKey(for: attachment)
            let isPlaying = audioPlayback.activeKey == playbackKey
            let localAudioData = localAudioDataByFileId[attachment.fileId]
            audioAttachmentCard(
                duration: audioPlayback.displayDuration(for: playbackKey, fallbackDuration: attachment.duration),
                currentTime: audioPlayback.currentTime(for: playbackKey),
                isLoading: audioPlayback.loadingKey == playbackKey,
                isPlaying: isPlaying,
                isCompact: false
            ) {
                Task {
                    if let localAudioData {
                        await audioPlayback.toggleAudioData(localAudioData, key: playbackKey)
                    } else if isLocalAttachmentFileId(attachment.fileId) {
                        audioPlayback.reportPlaybackUnavailable()
                    } else {
                        await audioPlayback.toggleRemoteAttachment(
                            attachment,
                            key: playbackKey
                        ) {
                            try await services.backend.fetchAttachmentData(fileId: attachment.fileId)
                        }
                    }
                }
            }

        case .file:
            attachmentCard(
                systemImage: "doc.fill",
                title: attachment.name ?? "File",
                subtitle: attachment.mimeType ?? "Attachment"
            )
            .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .onTapGesture {
                openAttachmentPreview(attachment, as: .file)
            }

        case .text:
            EmptyView()
        }
    }

    private func attachmentDisplaySize(
        attachment: MessageAttachmentDTO,
        maxWidth: CGFloat,
        maxHeight: CGFloat
    ) -> CGSize {
        let width = CGFloat(attachment.width ?? 0)
        let height = CGFloat(attachment.height ?? 0)
        let aspectRatio = (width > 0 && height > 0) ? width / height : 1

        var displayWidth = maxWidth
        var displayHeight = displayWidth / aspectRatio

        if displayHeight > maxHeight {
            displayHeight = maxHeight
            displayWidth = displayHeight * aspectRatio
        }

        return CGSize(
            width: max(1, displayWidth.rounded(.down)),
            height: max(1, displayHeight.rounded(.down))
        )
    }

    private func attachmentCard(systemImage: String, title: String, subtitle: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: systemImage)
                .font(.headline)
                .foregroundStyle(.orange)
                .frame(width: 34, height: 34)
                .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 10, style: .continuous))

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)

                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer(minLength: 0)
        }
        .frame(maxWidth: min(messageMaxWidth, 240), alignment: .leading)
    }

    private func pendingAudioAttachmentPreview(_ attachment: PendingChatAttachment) -> some View {
        let playbackKey = pendingAudioPlaybackKey(for: attachment)
        let isPlaying = audioPlayback.activeKey == playbackKey

        return ZStack(alignment: .topTrailing) {
            audioAttachmentCard(
                duration: audioPlayback.displayDuration(for: playbackKey, fallbackDuration: attachment.duration),
                currentTime: audioPlayback.currentTime(for: playbackKey),
                isLoading: false,
                isPlaying: isPlaying,
                isCompact: true
            ) {
                Task {
                    await audioPlayback.togglePendingAttachment(
                        attachment,
                        key: playbackKey
                    )
                }
            }
            .frame(maxWidth: 214, alignment: .leading)

            Button {
                clearPendingAttachment()
            } label: {
                Image(systemName: "xmark")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(.white.opacity(0.92))
                    .frame(width: 20, height: 20)
                    .background(.black.opacity(0.45), in: Circle())
            }
            .buttonStyle(.plain)
            .offset(x: 6, y: -6)
        }
    }

    private func audioAttachmentCard(
        duration: TimeInterval,
        currentTime: TimeInterval,
        isLoading: Bool,
        isPlaying: Bool,
        isCompact: Bool,
        action: @escaping () -> Void
    ) -> some View {
        let resolvedDuration = max(0, duration)
        let progress = resolvedDuration > 0 ? CGFloat(min(max(currentTime / resolvedDuration, 0), 1)) : 0
        let remainingTime = isPlaying && resolvedDuration > 0 ? max(0, resolvedDuration - currentTime) : resolvedDuration

        return HStack(spacing: isCompact ? 8 : 10) {
            ZStack {
                Circle()
                    .fill(audioPlayerButtonFill)
                    .frame(width: isCompact ? 32 : 38, height: isCompact ? 32 : 38)

                if isLoading {
                    ProgressView()
                        .controlSize(.small)
                        .tint(.orange)
                } else {
                    Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                        .font(.system(size: isCompact ? 13 : 15, weight: .bold))
                        .foregroundStyle(.orange)
                        .offset(x: isPlaying ? 0 : 1)
                }
            }

            VoiceWaveformProgressView(
                progress: progress,
                isPlaying: isPlaying,
                tint: .orange,
                trackTint: audioPlayerWaveformTrackTint
            )
            .frame(maxWidth: .infinity)

            Text(formatAudioDuration(Int(remainingTime.rounded())))
                .font(.caption.monospacedDigit().weight(.semibold))
                .foregroundStyle(audioPlayerSecondaryText)
                .frame(minWidth: 38, alignment: .trailing)
        }
        .padding(.horizontal, isCompact ? 9 : 11)
        .padding(.vertical, isCompact ? 7 : 9)
        .frame(maxWidth: isCompact ? 214 : min(messageMaxWidth, 256), alignment: .leading)
        .background(audioPlayerChrome)
        .contentShape(Capsule(style: .continuous))
        .highPriorityGesture(TapGesture().onEnded { action() })
        .accessibilityElement(children: .combine)
        .accessibilityLabel(L10n.tr("chat.attachment.audio"))
        .accessibilityAddTraits(.isButton)
        .accessibilityAction {
            action()
        }
    }

    @ViewBuilder
    private var audioPlayerChrome: some View {
        let shape = Capsule(style: .continuous)

        if #available(iOS 26.0, *) {
            shape
                .fill(.clear)
                .glassEffect(in: shape)
                .overlay {
                    shape
                        .stroke(.white.opacity(colorScheme == .dark ? 0.18 : 0.26), lineWidth: 0.8)
                }
        } else {
            shape
                .fill(audioPlayerLegacyFill)
                .overlay {
                    shape
                        .stroke(audioPlayerLegacyStroke, lineWidth: 0.8)
                }
        }
    }

    private var audioPlayerLegacyFill: Color {
        Color(uiColor: colorScheme == .dark ? .tertiarySystemBackground : .secondarySystemGroupedBackground)
            .opacity(colorScheme == .dark ? 0.74 : 0.84)
    }

    private var audioPlayerLegacyStroke: Color {
        colorScheme == .dark ? .white.opacity(0.09) : .black.opacity(0.06)
    }

    private var audioPlayerButtonFill: Color {
        colorScheme == .dark ? .white.opacity(0.12) : .white.opacity(0.78)
    }

    private var audioPlayerWaveformTrackTint: Color {
        colorScheme == .dark ? .white.opacity(0.24) : .black.opacity(0.18)
    }

    private var audioPlayerSecondaryText: Color {
        colorScheme == .dark ? .white.opacity(0.72) : .secondary
    }

    private func pendingAudioPlaybackKey(for attachment: PendingChatAttachment) -> String {
        "pending:\(attachment.fileName):\(attachment.size)"
    }

    private func remoteAudioPlaybackKey(for attachment: MessageAttachmentDTO) -> String {
        "remote:\(attachment.fileId)"
    }

    private func formatAudioDuration(_ duration: Int?) -> String {
        let totalSeconds = max(0, duration ?? 0)
        let minutes = totalSeconds / 60
        let seconds = totalSeconds % 60
        return String(format: "%d:%02d", minutes, seconds)
    }

    private func openAttachmentPreview(_ attachment: MessageAttachmentDTO, as kind: ChatAttachmentPreview.Kind) {
        guard !isLoadingAttachmentPreview else { return }

        isLoadingAttachmentPreview = true
        sendErrorMessage = nil

        Task {
            do {
                let data: Data?
                if let localData = localAttachmentDataByFileId[attachment.fileId] {
                    data = localData
                } else if isLocalAttachmentFileId(attachment.fileId) {
                    data = nil
                } else {
                    data = try await services.backend.fetchAttachmentData(fileId: attachment.fileId)
                }

                guard let data,
                      !data.isEmpty else {
                    throw AttachmentPreviewError.unavailable
                }

                let preview = try ChatAttachmentPreview.make(
                    attachment: attachment,
                    kind: kind,
                    data: data
                )

                await MainActor.run {
                    attachmentPreview = preview
                    isLoadingAttachmentPreview = false
                }
            } catch {
                await MainActor.run {
                    sendErrorMessage = error.localizedDescription
                    isLoadingAttachmentPreview = false
                }
            }
        }
    }

    private func bubblePosition(for index: Int) -> MessageBubblePosition {
        let groupedWithPrevious = isGroupedWithPrevious(for: index)
        let groupedWithNext = isGroupedWithNext(for: index)

        switch (groupedWithPrevious, groupedWithNext) {
        case (false, false):
            return .single
        case (false, true):
            return .first
        case (true, true):
            return .middle
        case (true, false):
            return .last
        }
    }

    private func isGroupedWithPrevious(for index: Int) -> Bool {
        guard messages.indices.contains(index), index > 0 else {
            return false
        }

        return shouldGroup(messages[index - 1], messages[index])
    }

    private func isGroupedWithNext(for index: Int) -> Bool {
        guard messages.indices.contains(index) else {
            return false
        }

        let nextIndex = messages.index(after: index)
        guard messages.indices.contains(nextIndex) else {
            return false
        }

        return shouldGroup(messages[index], messages[nextIndex])
    }

    private func shouldGroup(_ lhs: ChatMessage, _ rhs: ChatMessage) -> Bool {
        lhs.isMe == rhs.isMe && rhs.sentAt.timeIntervalSince(lhs.sentAt) <= (3 * 60)
    }

    private func topSpacing(for index: Int) -> CGFloat {
        if isGroupedWithPrevious(for: index) {
            return 2
        }

        return index == 0 ? 0 : 10
    }

    private func bottomSpacing(for index: Int) -> CGFloat {
        shouldShowTimestamp(for: index) ? 4 : 0
    }

    private var historyLoadControl: some View {
        VStack(spacing: 8) {
            if isLoadingOlderMessages {
                ProgressView()
            } else {
                if historyLoadFailed {
                    Text(L10n.tr("chat.history.error"))
                        .accessibilityIdentifier("chat.historyLoadError")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Button(L10n.tr(historyLoadFailed ? "chat.history.retry" : "chat.history.load")) {
                    loadOlderMessages()
                }
                .font(.footnote)
                .accessibilityIdentifier("chat.loadOlderMessages")
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
    }

    private func loadOlderMessages() {
        guard let cursor = olderMessagesCursor, !isLoadingOlderMessages else { return }
        isLoadingOlderMessages = true
        historyLoadFailed = false
        historyLoadTask = Task { @MainActor in
            defer { isLoadingOlderMessages = false }
            do {
                let page = try await services.backend.fetchMessagePage(threadId: thread.remoteId, before: cursor)
                try Task.checkCancellation()
                // Preserve the row being read, including when the user moves during the request.
                // Restore it after the prepended rows have been laid out.
                let anchor = visibleMessageID ?? messages.first?.id
                messages = ChatHistoryPagination.prepend(page.messages.map(ChatMessage.init(dto:)), to: messages)
                olderMessagesCursor = page.nextCursor
                historyScrollRestoreID = anchor
                RecentChatThreadStore.upsert(currentThreadSnapshot)
            } catch is CancellationError {
                return
            } catch {
                guard !Task.isCancelled else { return }
                historyLoadFailed = true
            }
        }
    }

    private func reloadThread() async {
        guard !isRefreshingThread else { return }
        isRefreshingThread = true
        defer { isRefreshingThread = false }
        let session = UserStore.shared.sessionRevision
        let previousNewest = latestHistoryAnchor
        do {
            let fetched = try await services.backend.fetchThread(threadId: thread.remoteId)
            guard session == UserStore.shared.sessionRevision, !Task.isCancelled else { return }
            guard let dto = fetched else {
                await MainActor.run {
                    if canInteractWithThread {
                        let snapshot = currentThreadSnapshot
                        RecentChatThreadStore.upsert(snapshot)
                        NotificationCenter.default.post(name: .fyreThreadsDidChange, object: snapshot)
                    } else {
                        RecentChatThreadStore.remove(remoteId: thread.remoteId)
                        NotificationCenter.default.post(name: .fyreThreadRemoved, object: thread.remoteId)
                        NotificationCenter.default.post(name: .fyreThreadsDidChange, object: nil)
                        dismiss()
                    }
                }
                return
            }

            var recentMessages = dto.messages.map(ChatMessage.init(dto:))
            var recentCursor = dto.olderMessagesCursor
            // After a long offline interval, bridge only the missed range before merging
            // with loaded history. A disjoint latest page must never leave a silent gap.
            while ChatHistoryPagination.needsBridge(recent: recentMessages, previousNewest: previousNewest, cursor: recentCursor),
                  let cursor = recentCursor {
                try Task.checkCancellation()
                let page = try await services.backend.fetchMessagePage(threadId: thread.remoteId, before: cursor)
                guard page.nextCursor != cursor else { throw AppwriteServiceError.invalidResponse }
                recentMessages = ChatHistoryPagination.prepend(page.messages.map(ChatMessage.init(dto:)), to: recentMessages)
                recentCursor = page.nextCursor
            }
            try Task.checkCancellation()
            guard session == UserStore.shared.sessionRevision else { return }
            olderMessagesCursor = ChatHistoryPagination.cursorAfterRefresh(
                current: messages, currentCursor: olderMessagesCursor,
                refreshed: recentMessages, refreshedCursor: recentCursor
            )
            latestHistoryAnchor = dto.messages.last.map(ChatMessage.init(dto:))
            let refreshedMessages = mergedMessagesKeepingLocalPending(
                remoteMessages: recentMessages, hasOlder: recentCursor != nil
            )
            let refreshedThread = ChatThread(
                id: dto.id,
                remoteId: dto.remoteId,
                name: dto.name,
                avatar: dto.avatar,
                isOnline: dto.isOnline,
                lastSeenAt: dto.lastSeenAt,
                currentUserReadAt: dto.currentUserReadAt,
                otherParticipantReadAt: dto.otherParticipantReadAt,
                participantUserIds: dto.participantUserIds,
                notificationsEnabled: dto.notificationsEnabled,
                relationshipState: dto.relationshipState,
                messages: refreshedMessages,
                olderMessagesCursor: olderMessagesCursor,
                remoteUnreadCount: dto.remoteUnreadCount
            )

            await MainActor.run {
                if messages != refreshedMessages {
                    messages = refreshedMessages
                }

                if !ThreadNaming.isPlaceholderThreadName(dto.name) || ThreadNaming.isPlaceholderThreadName(threadName) {
                    threadName = dto.name
                }

                if !dto.avatar.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    threadAvatar = dto.avatar
                }
                threadIsOnline = dto.isOnline
                otherParticipantReadAt = dto.otherParticipantReadAt
                threadNotificationsEnabled = dto.notificationsEnabled
                relationshipState = dto.relationshipState
                RecentChatThreadStore.upsert(refreshedThread)
            }
            guard session == UserStore.shared.sessionRevision else { return }
            await services.backend.markThreadRead(threadId: thread.remoteId)
        } catch {
#if DEBUG
            debugPrint("Chat refresh failed")
#endif
        }
    }

    private var currentThreadSnapshot: ChatThread {
        ChatThread(
            id: thread.id,
            remoteId: thread.remoteId,
            name: threadName,
            avatar: threadAvatar,
            isOnline: threadIsOnline,
            lastSeenAt: thread.lastSeenAt,
            currentUserReadAt: thread.currentUserReadAt,
            otherParticipantReadAt: otherParticipantReadAt,
            participantUserIds: thread.participantUserIds,
            notificationsEnabled: threadNotificationsEnabled,
            relationshipState: relationshipState,
            messages: messages,
            olderMessagesCursor: olderMessagesCursor
        )
    }

    private func mergedMessagesKeepingLocalPending(remoteMessages: [ChatMessage], hasOlder: Bool) -> [ChatMessage] {
        for localMessage in messages where localMessage.isMe {
            let confirmedId = ChatMessageReconciliation.confirmedID(
                for: localMessage, userId: UserStore.shared.currentUser?.appwriteUserId, threadId: thread.remoteId
            )
            if let remoteMessage = remoteMessages.first(where: { $0.remoteId == confirmedId }) {
                transferLocalAttachmentCache(from: localMessage, to: remoteMessage)
            }
        }
        return ChatHistoryPagination.mergeRecent(
            remoteMessages, into: messages, hasOlder: hasOlder,
            userId: UserStore.shared.currentUser?.appwriteUserId, threadId: thread.remoteId
        )
    }

    private func transferLocalAttachmentCache(from localMessage: ChatMessage, to remoteMessage: ChatMessage) {
        guard localMessage.messageType == remoteMessage.messageType,
              let localFileId = localMessage.attachment?.fileId,
              let remoteFileId = remoteMessage.attachment?.fileId,
              localFileId != remoteFileId else {
            return
        }

        if let data = localAttachmentDataByFileId[localFileId] {
            localAttachmentDataByFileId[remoteFileId] = data
            localAttachmentDataByFileId.removeValue(forKey: localFileId)
        }

        guard localMessage.messageType == .audio,
              let audioData = localAudioDataByFileId[localFileId] else {
            return
        }

        localAudioDataByFileId[remoteFileId] = audioData
        localAudioDataByFileId.removeValue(forKey: localFileId)
    }

    private func startRealtime() {
#if DEBUG
        guard !ChatHistoryPreview.isEnabled else { return }
#endif
        guard realtimeSubscription == nil else { return }

        realtimeSubscription = AppwriteRealtimeService.makeChatSubscription(
            threadId: thread.remoteId,
            onEvent: { event in
                NotificationCenter.default.post(name: .fyreThreadsDidChange, object: nil)
                handleRealtimeEvent(event)
            },
            onError: { error in
#if DEBUG
                debugPrint("Chat realtime error")
#endif
            }
        )
    }

    private func stopRealtime() {
        historyLoadTask?.cancel()
        historyLoadTask = nil
        realtimeReloadTask?.cancel()
        realtimeReloadTask = nil
        realtimeSubscription?.cancel()
        realtimeSubscription = nil
    }

    private func startReconciliationPolling() {
        guard reconciliationPollingTask == nil else { return }

        reconciliationPollingTask = Task {
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 30_000_000_000)
                guard !Task.isCancelled else { return }
                await reloadThread()
            }
        }
    }

    private func stopReconciliationPolling() {
        reconciliationPollingTask?.cancel()
        reconciliationPollingTask = nil
    }

    private func scheduleRealtimeReload() {
        realtimeReloadTask?.cancel()
        realtimeReloadTask = Task {
            try? await Task.sleep(nanoseconds: 40_000_000)
            guard !Task.isCancelled else { return }
            await reloadThread()
        }
    }

    private func handleRealtimeEvent(_ event: AppwriteRealtimeEvent) {
        if event.isDelete, let remoteId = event.stringValue(forKey: "$id"),
           event.stringValue(forKey: "threadId") == thread.remoteId {
            messages.removeAll { $0.remoteId == remoteId }
            if olderMessagesCursor == remoteId {
                olderMessagesCursor = messages.first(where: { !$0.remoteId.hasPrefix("local-") })?.remoteId
            }
            scheduleRealtimeReload()
            return
        }
        if event.isCreate || event.isUpdate, let message = makeRealtimeMessage(from: event),
           event.stringValue(forKey: "threadId") == thread.remoteId,
           event.stringValue(forKey: "senderUserId") != nil {
            upsertMessage(message)
            if message.replyToRemoteId != nil {
                scheduleRealtimeReload()
            }
            if !message.isMe {
                markThreadAsRead()
            }
            return
        }

        scheduleRealtimeReload()
    }

    private func makeRealtimeMessage(from event: AppwriteRealtimeEvent) -> ChatMessage? {
        guard let remoteId = event.stringValue(forKey: "$id") else {
            return nil
        }

        let currentAccountId = UserStore.shared.currentUser?.appwriteUserId?.trimmingCharacters(in: .whitespacesAndNewlines)
        let senderUserId = event.stringValue(forKey: "senderUserId")
        let messageType = MessageTypeDTO(rawValue: event.stringValue(forKey: "messageType") ?? "text") ?? .text
        let attachment = makeRealtimeAttachment(from: event)
        let text = event.stringValue(forKey: "text") ?? ""
        let sentAt = event.dateValue(forKey: "createdAt")
            ?? event.dateValue(forKey: "$createdAt")
            ?? event.timestamp
            ?? Date()

        guard !text.isEmpty || attachment != nil || messageType == .text else {
            return nil
        }

        return ChatMessage(
            id: stableMessageUUID(from: remoteId),
            remoteId: remoteId,
            text: text,
            messageType: messageType,
            attachment: attachment,
            isMe: senderUserId == currentAccountId,
            time: Self.messageTimeFormatter.string(from: sentAt),
            sentAt: sentAt,
            replyToRemoteId: event.stringValue(forKey: "replyToMessageId"),
            replyPreviewText: event.stringValue(forKey: "replyToMessageId").flatMap { replyId in
                messages.first(where: { $0.remoteId == replyId }).map(replyPreviewText(for:))
            }
        )
    }

    private func makeRealtimeAttachment(from event: AppwriteRealtimeEvent) -> MessageAttachmentDTO? {
        guard let fileId = event.stringValue(forKey: "attachmentFileId") else { return nil }

        return MessageAttachmentDTO(
            fileId: fileId,
            name: event.stringValue(forKey: "attachmentName"),
            mimeType: event.stringValue(forKey: "attachmentMimeType"),
            size: event.intValue(forKey: "attachmentSize"),
            width: event.intValue(forKey: "attachmentWidth"),
            height: event.intValue(forKey: "attachmentHeight"),
            duration: event.intValue(forKey: "attachmentDuration")
        )
    }

    private func upsertMessage(_ message: ChatMessage) {
        if let existingIndex = messages.firstIndex(where: {
            $0.remoteId == message.remoteId || ChatMessageReconciliation.confirmedID(
                for: $0, userId: UserStore.shared.currentUser?.appwriteUserId, threadId: thread.remoteId
            ) == message.remoteId
        }) {
            transferLocalAttachmentCache(from: messages[existingIndex], to: message)
            messages[existingIndex] = message
            messages.sort(by: ChatHistoryPagination.precedes)
            return
        }

        animatingMessageIDs.insert(message.id)
        withAnimation(.spring(response: 0.32, dampingFraction: 0.82)) {
            messages.append(message)
            messages.sort(by: ChatHistoryPagination.precedes)
        }
        settleMessageAnimation(for: message.id)
    }

    private func markThreadAsRead() {
        Task {
            await services.backend.markThreadRead(threadId: thread.remoteId)
        }
    }

    private func confirmTitle(for action: RelationshipActionDTO) -> String {
        switch action {
        case .archive:
            return L10n.tr("messages.archive.confirmTitle")
        case .unmatch:
            return L10n.tr("messages.unmatch.confirmTitle")
        case .block:
            return L10n.tr("messages.block.confirmTitle")
        }
    }

    private func confirmMessage(for action: RelationshipActionDTO) -> String {
        switch action {
        case .archive:
            return L10n.tr("messages.archive.confirmMessage")
        case .unmatch:
            return L10n.tr("messages.unmatch.confirmMessage")
        case .block:
            return L10n.tr("messages.block.confirmMessage")
        }
    }

    private func confirmButtonTitle(for action: RelationshipActionDTO) -> String {
        switch action {
        case .archive:
            return L10n.tr("messages.archive.action")
        case .unmatch:
            return L10n.tr("messages.unmatch.action")
        case .block:
            return L10n.tr("messages.block.action")
        }
    }

    private func readReceiptLabel(for message: ChatMessage) -> String? {
        guard message.isMe else { return nil }

        if isMessageReadByPeer(message) {
            return latestReadOutgoingMessage()?.id == message.id ? L10n.tr("messages.read") : nil
        }

        return latestUnreadOutgoingMessage()?.id == message.id ? L10n.tr("messages.sent") : nil
    }

    private func readTimestamp(for message: ChatMessage) -> Date? {
        guard isMessageReadByPeer(message) else {
            return nil
        }

        return otherParticipantReadAt
    }

    private func isMessageReadByPeer(_ message: ChatMessage) -> Bool {
        guard message.isMe, let otherParticipantReadAt else {
            return false
        }
        return otherParticipantReadAt >= message.sentAt
    }

    private func shouldShowTimestamp(for index: Int) -> Bool {
        guard messages.indices.contains(index) else {
            return false
        }

        let current = messages[index]
        let nextIndex = messages.index(after: index)
        guard messages.indices.contains(nextIndex) else {
            return true
        }

        let next = messages[nextIndex]
        guard current.isMe == next.isMe else {
            return true
        }

        return next.sentAt.timeIntervalSince(current.sentAt) > (3 * 60)
    }

    private func shouldShowMetadata(for index: Int) -> Bool {
        guard messages.indices.contains(index) else {
            return false
        }

        return shouldShowTimestamp(for: index) || readReceiptLabel(for: messages[index]) != nil
    }

    @ViewBuilder
    private func messageMetadataView(message: ChatMessage, index: Int) -> some View {
        let showsTimestamp = shouldShowTimestamp(for: index)
        let receiptLabel = readReceiptLabel(for: message)
        let metadataForeground = messageMetadataForegroundStyle

        HStack(spacing: 4) {
            if showsTimestamp {
                Text(message.time)
                    .font(.caption2)
                    .foregroundStyle(metadataForeground)
            }

            if showsTimestamp, receiptLabel != nil {
                Text("•")
                    .font(.caption2)
                    .foregroundStyle(metadataForeground)
            }

            if let receiptLabel {
                Text(receiptLabel)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(metadataForeground)
            }
        }
        .shadow(
            color: isLightChatBackground ? .white.opacity(0.42) : .black.opacity(0.42),
            radius: 2,
            y: 1
        )
        .padding(.horizontal, 2)
        .padding(.top, 1)
        .opacity(isAnimating(message) ? 0.5 : 1)
    }

    private func latestReadOutgoingMessage() -> ChatMessage? {
        messages.last(where: { $0.isMe && isMessageReadByPeer($0) })
    }

    private func latestUnreadOutgoingMessage() -> ChatMessage? {
        messages.last(where: { $0.isMe && !isMessageReadByPeer($0) })
    }

    private func shouldShowDateSeparator(before index: Int) -> Bool {
        guard messages.indices.contains(index) else {
            return false
        }

        guard index > 0 else {
            return true
        }

        let previous = messages[index - 1]
        let current = messages[index]
        return !Calendar.current.isDate(previous.sentAt, inSameDayAs: current.sentAt)
    }

    private func dateSeparatorLabel(for date: Date) -> String {
        let calendar = Calendar.current
        let formatter = calendar.isDate(date, equalTo: Date(), toGranularity: .year)
            ? Self.messageDayFormatter
            : Self.messageDayWithYearFormatter
        return formatter.string(from: date)
    }

    private func messageInsertionTransition(isOutgoing: Bool) -> AnyTransition {
        let anchor: UnitPoint = isOutgoing ? .trailing : .leading
        return .asymmetric(
            insertion: .opacity,
            removal: .opacity.combined(with: .scale(scale: 0.98, anchor: anchor))
        )
    }

    private func scrollToLatestMessage(using proxy: ScrollViewProxy, animated: Bool) {
        guard let latestID = messages.last?.id else {
            return
        }

        let scroll = {
            proxy.scrollTo(latestID, anchor: .bottom)
        }

        if animated {
            withAnimation(.spring(response: 0.34, dampingFraction: 0.86)) {
                scroll()
            }
        } else {
            scroll()
        }
    }

    private func settleInitialScroll(using proxy: ScrollViewProxy) {
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 140_000_000)
            if let latestID = messages.last?.id {
                proxy.scrollTo(latestID, anchor: .bottom)
            }
            try? await Task.sleep(nanoseconds: 150_000_000)
            isHistoryScrollReady = true
        }
    }

    private func isAnimating(_ message: ChatMessage) -> Bool {
        animatingMessageIDs.contains(message.id)
    }

    private func settleMessageAnimation(for messageID: UUID) {
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 35_000_000)
            _ = withAnimation(.spring(response: 0.42, dampingFraction: 0.84, blendDuration: 0.14)) {
                animatingMessageIDs.remove(messageID)
            }
        }
    }

    private func loadPendingAttachment(from item: PhotosPickerItem) async {
        do {
            guard let picked = try await item.loadTransferable(type: BoundedPickedAttachment.self) else {
                throw ChatAttachmentValidationError.unsupportedFormat
            }
            guard let contentType = item.supportedContentTypes.first(where: {
                PendingChatAttachment.supports(contentType: $0)
            }) else {
                throw ChatAttachmentValidationError.unsupportedFormat
            }

            let resolved = try PendingChatAttachment.from(
                data: picked.data,
                fileName: picked.fileName,
                contentType: contentType
            )
            await MainActor.run {
                pendingAttachment = resolved
                if resolved.type == .audio {
                    draft = ""
                    isInputFocused = false
                }
                sendErrorMessage = nil
            }
        } catch {
            await MainActor.run {
                sendErrorMessage = error.localizedDescription
            }
        }
    }

    private func handleAttachmentFileSelection(_ result: Result<URL, Error>) {
        do {
            let url = try result.get()
            let didStartAccessing = url.startAccessingSecurityScopedResource()
            defer {
                if didStartAccessing {
                    url.stopAccessingSecurityScopedResource()
                }
            }

            let data = try BoundedAttachment.read(url)
            let contentType = UTType(filenameExtension: url.pathExtension) ?? .data
            pendingAttachment = try PendingChatAttachment.from(
                data: data,
                fileName: url.lastPathComponent,
                contentType: contentType
            )
            if pendingAttachment?.type == .audio {
                draft = ""
                isInputFocused = false
            }
            sendErrorMessage = nil
        } catch {
            sendErrorMessage = error.localizedDescription
        }
    }

    private func handleCapturedImage(_ image: UIImage?) {
        guard let image else { return }

        let scale = min(1, 2048 / max(image.size.width, image.size.height))
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let rendererFormat = image.imageRendererFormat
        rendererFormat.scale = 1
        let normalized = UIGraphicsImageRenderer(size: size, format: rendererFormat).image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }

        guard let data = normalized.jpegData(compressionQuality: 0.96) else {
            sendErrorMessage = ChatAttachmentValidationError.unsupportedFormat.localizedDescription
            return
        }

        let fileName = "camera-\(UUID().uuidString).jpg"
        do {
            pendingAttachment = try PendingChatAttachment.from(
                data: data,
                fileName: fileName,
                contentType: .jpeg
            )
        } catch {
            sendErrorMessage = error.localizedDescription
            return
        }
        sendErrorMessage = nil
    }

    private func stableMessageUUID(from text: String) -> UUID {
        if let uuid = UUID(uuidString: text) {
            return uuid
        }

        var bytes = [UInt8](repeating: 0, count: 16)
        for (index, byte) in text.utf8.enumerated() {
            bytes[index % bytes.count] ^= byte
        }
        bytes[6] = (bytes[6] & 0x0F) | 0x40
        bytes[8] = (bytes[8] & 0x3F) | 0x80

        return UUID(uuid: (
            bytes[0], bytes[1], bytes[2], bytes[3],
            bytes[4], bytes[5], bytes[6], bytes[7],
            bytes[8], bytes[9], bytes[10], bytes[11],
            bytes[12], bytes[13], bytes[14], bytes[15]
        ))
    }

    private static let messageTimeFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "it_IT")
        formatter.dateFormat = "HH:mm"
        return formatter
    }()

    private static let messageDayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale.autoupdatingCurrent
        formatter.setLocalizedDateFormatFromTemplate("EEE d MMMM")
        return formatter
    }()

    private static let messageDayWithYearFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale.autoupdatingCurrent
        formatter.setLocalizedDateFormatFromTemplate("EEE d MMMM y")
        return formatter
    }()
}
