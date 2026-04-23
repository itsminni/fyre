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
import Combine
import Combine
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
    private struct PendingRelationshipAction: Identifiable {
        let id = UUID()
        let action: RelationshipActionDTO
    }

    @Environment(AppServices.self) private var services
    @Environment(\.dismiss) private var dismiss
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
    @State private var relationshipState: RelationshipStateDTO
    @State private var messages: [ChatMessage]
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
    @State private var realtimeSubscription: AppwriteRealtimeSubscription?
    @State private var realtimeReloadTask: Task<Void, Never>?
    @State private var animatingMessageIDs: Set<UUID> = []
    @State private var activeReplySwipeMessageID: UUID?
    @State private var activeReplySwipeOffset: CGFloat = 0
    @State private var attachmentPreview: ChatAttachmentPreview?
    @State private var isLoadingAttachmentPreview = false
    @State private var scrollViewportHeight: CGFloat = 0
    @State private var bottomAnchorMinY: CGFloat = 0
    @State private var initialScrollTicket = UUID()
    @State private var pendingRelationshipAction: PendingRelationshipAction?
    @State private var messageReadInfoMessage: ChatMessage?
    @State private var keyboardOverlap: CGFloat = 0
    @FocusState private var isInputFocused: Bool
    @StateObject private var audioPlayback = ChatAudioPlaybackController()
    @StateObject private var voiceRecorder = ChatVoiceRecorder()

    init(thread: ChatThread) {
        self.thread = thread
        _threadName = State(initialValue: thread.name)
        _threadAvatar = State(initialValue: thread.avatar)
        _threadIsOnline = State(initialValue: thread.isOnline)
        _otherParticipantReadAt = State(initialValue: thread.otherParticipantReadAt)
        _relationshipState = State(initialValue: thread.relationshipState)
        _messages = State(initialValue: thread.messages)
    }

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(messages.enumerated()), id: \.element.id) { index, message in
                            messageRow(message, at: index)
                        }
                    }
                    .padding(.top, messageListTopInset)
                    .padding(.bottom, messageListBottomInset)

                    Color.clear
                        .frame(height: 1)
                        .background(ChatBottomAnchorReader())
                }
                .defaultScrollAnchor(.bottom)
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
                .onAppear {
                    scrollToLatestMessage(using: proxy, animated: false)
                    settleInitialScroll(using: proxy)
                    markThreadAsRead()
                }
                .onChange(of: messages.last?.id, initial: false) {
                    scrollToLatestMessage(using: proxy, animated: true)
                    markThreadAsRead()
                }
                .onChange(of: initialScrollTicket, initial: false) {
                    scrollToLatestMessage(using: proxy, animated: false)
                    settleInitialScroll(using: proxy)
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
        .onDisappear {
            stopRealtime()
            audioPlayback.stop()
            voiceRecorder.cancel()
        }
        .fileImporter(
            isPresented: $isAttachmentFileImporterPresented,
            allowedContentTypes: [.image, .movie, .audio, .pdf, .data]
        ) { result in
            handleAttachmentFileSelection(result)
        }
        .sheet(item: $attachmentPreview) { preview in
            ChatAttachmentPreviewSheet(preview: preview)
        }
        .sheet(item: $messageReadInfoMessage) { message in
            MessageReadInfoSheet(
                message: message,
                readAt: readTimestamp(for: message)
            )
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
                .id(message.id)
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
        .accessibilityLabel("Back")
    }

    private var chatHeaderPrincipal: some View {
        HStack(spacing: 8) {
            ChatAvatarView(
                name: threadName,
                avatarKey: threadAvatar,
                size: 30,
                isOnline: threadIsOnline,
                showsPresence: false
            )

            VStack(alignment: .leading, spacing: 1) {
                Text(threadName)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)

                if threadIsOnline {
                    Text("Online")
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
                pendingRelationshipAction = PendingRelationshipAction(action: .archive)
            } label: {
                relationshipMenuActionLabel(
                    title: L10n.tr("messages.archive.action"),
                    systemImage: "archivebox",
                    textColor: .white,
                    iconColor: .red
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

            Button {
                pendingRelationshipAction = PendingRelationshipAction(action: .block)
            } label: {
                relationshipMenuActionLabel(
                    title: L10n.tr("messages.block.action"),
                    systemImage: "hand.raised",
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
        .accessibilityLabel("More options")
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
            isInputFocused = true
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
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard canInteractWithThread, !text.isEmpty || pendingAttachment != nil else { return }
        audioPlayback.stop()
        let replyTarget = replyingToMessage
        let optimisticMessageID = UUID()
        let optimisticMessage = makeOptimisticOutgoingMessage(
            id: optimisticMessageID,
            text: text,
            replyTarget: replyTarget,
            attachment: pendingAttachment
        )
        // Clear optimistically for a snappy composer, then restore the draft if the send fails.
        draft = ""
        let attachment = pendingAttachment
        pendingAttachment = nil
        sendErrorMessage = nil
        isSending = true
        upsertMessage(optimisticMessage)
        replyingToMessage = nil

        Task {
            do {
                let dto = try await services.backend.sendMessage(
                    threadId: thread.remoteId,
                    text: text,
                    replyToMessageId: replyTarget?.remoteId,
                    attachment: attachment?.outgoingAttachment
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
                    reconcileOptimisticMessage(id: optimisticMessageID, with: message)
                    NotificationCenter.default.post(name: .fyreThreadsDidChange, object: nil)
                    isSending = false
                }
            } catch {
                await MainActor.run {
                    messages.removeAll { $0.id == optimisticMessageID }
                    draft = text
                    pendingAttachment = attachment
                    replyingToMessage = replyTarget
#if DEBUG
                    sendErrorMessage = error.localizedDescription
#else
                    sendErrorMessage = L10n.tr("chat.error.sendFailed")
#endif
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
        if let existingIndex = messages.firstIndex(where: { $0.id == id }) {
            messages[existingIndex] = confirmed
            messages.sort { $0.sentAt < $1.sentAt }
            return
        }

        upsertMessage(confirmed)
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
            modernComposerRow
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 10)
        .padding(.top, 6)
    }

    @ViewBuilder
    private var legacyComposerOverlay: some View {
        VStack(alignment: .leading, spacing: 8) {
            composerStatusAndReplyContent
            legacyComposerRow
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, usesIOS18LegacyChatChrome ? 8 : 12)
        .padding(.top, usesIOS18LegacyChatChrome ? legacyKeyboardSurfaceInset : 6)
    }

    @ViewBuilder
    private var composerStatusAndReplyContent: some View {
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
            .accessibilityLabel("Delete voice recording")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var messageListTopInset: CGFloat {
        0
    }

    private var messageListBottomInset: CGFloat {
        10
    }

    private var messageMaxWidth: CGFloat {
        UIScreen.main.bounds.width * 0.72
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
            .font(.headline.weight(.semibold))
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
                } else {
                    TextField(L10n.tr("chat.message.placeholder"), text: $draft, axis: .vertical)
                        .foregroundStyle(shouldUseDarkComposerChrome ? Color.white : Color.primary)
                        .focused($isInputFocused)
                        .textFieldStyle(.plain)
                        .submitLabel(.send)
                        .onSubmit(sendMessage)
                        .lineLimit(1...4)
                }

                Button(action: handleMicrophoneButtonTap) {
                    Image(systemName: "mic.fill")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(voiceRecorder.isRecording ? .red : composerSecondaryForegroundColor)
                        .frame(width: metrics.inlineAccessorySize, height: metrics.inlineAccessorySize)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Microphone")
                .disabled(isSending || (pendingAttachment != nil && !voiceRecorder.isRecording))
            }
            .padding(.horizontal, metrics.fieldHorizontalPadding)
            .padding(.vertical, metrics.fieldVerticalPadding)
            .background(composerFieldChrome(cornerRadius: metrics.fieldCornerRadius))
            .frame(maxWidth: .infinity, minHeight: metrics.fieldMinHeight, alignment: .leading)

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
                } else {
                    TextField(L10n.tr("chat.message.placeholder"), text: $draft, axis: .vertical)
                        .foregroundStyle(.primary)
                        .focused($isInputFocused)
                        .textFieldStyle(.plain)
                        .submitLabel(.send)
                        .onSubmit(sendMessage)
                        .lineLimit(1...4)
                }

                Button(action: handleMicrophoneButtonTap) {
                    Image(systemName: "mic.fill")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(voiceRecorder.isRecording ? .red : .secondary)
                        .frame(width: 28, height: 28)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Microphone")
                .disabled(isSending || (pendingAttachment != nil && !voiceRecorder.isRecording))
            }
            .padding(.horizontal, usesIOS18LegacyChatChrome ? 13 : 14)
            .padding(.vertical, usesIOS18LegacyChatChrome ? 7 : 10)
            .background(legacyComposerFieldChrome(cornerRadius: usesIOS18LegacyChatChrome ? 20 : 23))
            .frame(maxWidth: .infinity, minHeight: usesIOS18LegacyChatChrome ? 42 : 46, alignment: .leading)

            if usesIOS18LegacyChatChrome {
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
        let palette = isOutgoing ? outgoingBubbleStyle : incomingBubbleStyle
        return AnyShapeStyle(palette.textColor(colorScheme: colorScheme, isOutgoing: isOutgoing))
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
                Text(message.text)
                    .font(.body)
                    .multilineTextAlignment(.leading)
                    .foregroundStyle(messageTextStyle(isOutgoing: message.isMe))
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
                .foregroundStyle(isOutgoing ? .white.opacity(0.82) : .secondary)
                .lineLimit(1)

            Text(text)
                .font(.callout)
                .foregroundStyle(isOutgoing ? .white.opacity(0.94) : .primary.opacity(0.90))
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

    @ViewBuilder
    private func messageAttachmentView(
        attachment: MessageAttachmentDTO,
        messageType: MessageTypeDTO,
        isEmbeddedInBubble: Bool
    ) -> some View {
        switch messageType {
        case .image:
            RemoteChatAttachmentImage(fileId: attachment.fileId)
                .frame(
                    maxWidth: isEmbeddedInBubble ? max(messageMaxWidth - 24, 180) : min(messageMaxWidth + 24, 292),
                    maxHeight: 292
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
            attachmentCard(
                systemImage: "video.fill",
                title: attachment.name ?? "Video",
                subtitle: attachment.duration.map { "\($0)s" } ?? "Video"
            )
            .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .onTapGesture {
                openAttachmentPreview(attachment, as: .video)
            }

        case .audio:
            audioAttachmentCard(
                title: L10n.tr("chat.attachment.audio"),
                subtitle: formatAudioDuration(attachment.duration),
                isLoading: audioPlayback.loadingKey == remoteAudioPlaybackKey(for: attachment),
                isPlaying: audioPlayback.activeKey == remoteAudioPlaybackKey(for: attachment)
            ) {
                Task {
                    await audioPlayback.toggleRemoteAttachment(
                        attachment,
                        key: remoteAudioPlaybackKey(for: attachment)
                    ) {
                        try await services.backend.fetchAttachmentData(fileId: attachment.fileId)
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
        ZStack(alignment: .topTrailing) {
            audioAttachmentCard(
                title: L10n.tr("chat.attachment.audio"),
                subtitle: formatAudioDuration(attachment.duration),
                isLoading: false,
                isPlaying: audioPlayback.activeKey == pendingAudioPlaybackKey(for: attachment)
            ) {
                Task {
                    await audioPlayback.togglePendingAttachment(
                        attachment,
                        key: pendingAudioPlaybackKey(for: attachment)
                    )
                }
            }
            .frame(maxWidth: 184, alignment: .leading)

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
        title: String,
        subtitle: String,
        isLoading: Bool,
        isPlaying: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 10) {
                ZStack {
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(.white.opacity(0.08))
                        .frame(width: 38, height: 38)

                    if isLoading {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Image(systemName: isPlaying ? "stop.fill" : "play.fill")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.orange)
                    }
                }

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
        .buttonStyle(.plain)
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
                guard let data = try await services.backend.fetchAttachmentData(fileId: attachment.fileId),
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

    private func reloadThread() async {
        do {
            guard let dto = try await services.backend.fetchThread(threadId: thread.remoteId) else {
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

            let refreshedMessages = dto.messages.map(ChatMessage.init(dto:))
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
                relationshipState: dto.relationshipState,
                messages: refreshedMessages
            )

            await MainActor.run {
                messages = refreshedMessages
                initialScrollTicket = UUID()

                if !ThreadNaming.isPlaceholderThreadName(dto.name) || ThreadNaming.isPlaceholderThreadName(threadName) {
                    threadName = dto.name
                }

                if !dto.avatar.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    threadAvatar = dto.avatar
                }
                threadIsOnline = dto.isOnline
                otherParticipantReadAt = dto.otherParticipantReadAt
                relationshipState = dto.relationshipState
                RecentChatThreadStore.upsert(refreshedThread)
            }
            await services.backend.markThreadRead(threadId: thread.remoteId)
        } catch {
#if DEBUG
            debugPrint("Chat refresh failed for \(thread.remoteId): \(error.localizedDescription)")
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
            relationshipState: relationshipState,
            messages: messages
        )
    }

    private func startRealtime() {
        guard realtimeSubscription == nil else { return }

        realtimeSubscription = AppwriteRealtimeService.makeChatSubscription(
            threadId: thread.remoteId,
            onEvent: { event in
                NotificationCenter.default.post(name: .fyreThreadsDidChange, object: nil)
                handleRealtimeEvent(event)
            },
            onError: { error in
#if DEBUG
                debugPrint("Chat realtime error for \(thread.remoteId): \(error.localizedDescription)")
#endif
            }
        )
    }

    private func stopRealtime() {
        realtimeReloadTask?.cancel()
        realtimeReloadTask = nil
        realtimeSubscription?.cancel()
        realtimeSubscription = nil
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
        if event.isCreate, let message = makeRealtimeMessage(from: event) {
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
            size: event.payload["attachmentSize"] as? Int,
            width: event.payload["attachmentWidth"] as? Int,
            height: event.payload["attachmentHeight"] as? Int,
            duration: event.payload["attachmentDuration"] as? Int
        )
    }

    private func upsertMessage(_ message: ChatMessage) {
        if let existingIndex = messages.firstIndex(where: { $0.remoteId == message.remoteId }) {
            messages[existingIndex] = message
            messages.sort { $0.sentAt < $1.sentAt }
            return
        }

        animatingMessageIDs.insert(message.id)
        withAnimation(.spring(response: 0.32, dampingFraction: 0.82)) {
            messages.append(message)
            messages.sort { $0.sentAt < $1.sentAt }
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
            guard let latestID = messages.last?.id else { return }
            proxy.scrollTo(latestID, anchor: .bottom)
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
            guard let data = try await item.loadTransferable(type: Data.self),
                  let contentType = item.supportedContentTypes.first else {
                throw ChatBackgroundAssetStoreError.invalidImage
            }

            let resolved = PendingChatAttachment.from(
                data: data,
                fileName: item.itemIdentifier ?? "attachment",
                contentType: contentType
            )
            await MainActor.run {
                pendingAttachment = resolved
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

            let data = try Data(contentsOf: url)
            let contentType = UTType(filenameExtension: url.pathExtension) ?? .data
            pendingAttachment = PendingChatAttachment.from(
                data: data,
                fileName: url.lastPathComponent,
                contentType: contentType
            )
            sendErrorMessage = nil
        } catch {
            sendErrorMessage = error.localizedDescription
        }
    }

    private func handleCapturedImage(_ image: UIImage?) {
        guard let image else { return }

        let rendererFormat = image.imageRendererFormat
        let normalized = UIGraphicsImageRenderer(size: image.size, format: rendererFormat).image { _ in
            image.draw(in: CGRect(origin: .zero, size: image.size))
        }

        guard let data = normalized.jpegData(compressionQuality: 0.96) else {
            sendErrorMessage = ChatBackgroundAssetStoreError.invalidImage.localizedDescription
            return
        }

        let fileName = "camera-\(UUID().uuidString).jpg"
        pendingAttachment = PendingChatAttachment.from(
            data: data,
            fileName: fileName,
            contentType: .jpeg
        )
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

@MainActor
private final class ChatAudioPlaybackController: NSObject, ObservableObject, AVAudioPlayerDelegate {
    let objectWillChange: ObservableObjectPublisher

    @Published private(set) var activeKey: String?
    @Published private(set) var loadingKey: String?

    private var player: AVAudioPlayer?

    override init() {
        objectWillChange = ObservableObjectPublisher()
        super.init()
    }

    func togglePendingAttachment(_ attachment: PendingChatAttachment, key: String) async {
        if activeKey == key {
            stop()
            return
        }

        do {
            try configurePlaybackSession()
            let player = try AVAudioPlayer(data: attachment.data)
            play(player: player, key: key)
        } catch {
#if DEBUG
            debugPrint("Pending audio playback failed: \(error.localizedDescription)")
#endif
        }
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
            guard let data = try await loader(), !data.isEmpty else {
                loadingKey = nil
                return
            }

            try configurePlaybackSession()
            let player = try AVAudioPlayer(data: data)
            loadingKey = nil
            play(player: player, key: key)
        } catch {
            loadingKey = nil
#if DEBUG
            debugPrint("Remote audio playback failed for \(attachment.fileId): \(error.localizedDescription)")
#endif
        }
    }

    func stop() {
        player?.stop()
        player = nil
        activeKey = nil
        loadingKey = nil
    }

    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        _ = flag
        stop()
    }

    private func play(player: AVAudioPlayer, key: String) {
        stop()
        self.player = player
        self.player?.delegate = self
        self.player?.prepareToPlay()
        self.player?.play()
        activeKey = key
    }

    private func configurePlaybackSession() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playback, mode: .default, options: [.defaultToSpeaker, .allowBluetoothA2DP])
        try session.setActive(true)
    }
}

@MainActor
private final class ChatVoiceRecorder: NSObject, ObservableObject, AVAudioRecorderDelegate {
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
    }

    func stop() throws -> PendingChatAttachment {
        guard let recorder, let recordingURL else {
            throw ChatVoiceRecordingError.noRecording
        }

        let duration = max(1, Int(recorder.currentTime.rounded()))
        recorder.stop()
        stopTimer()
        self.recorder = nil
        self.recordingURL = nil
        isRecording = false

        let data = try Data(contentsOf: recordingURL)
        try deactivateSession()

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
        recorder?.stop()
        recorder = nil
        recordingURL = nil
        isRecording = false
        elapsedDuration = 0
        stopTimer()
        try? deactivateSession()
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

private enum ChatVoiceRecordingError: LocalizedError {
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

private struct PendingChatAttachment {
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

    static func voiceMessage(data: Data, fileName: String, mimeType: String = "audio/m4a", duration: Int) -> PendingChatAttachment {
        PendingChatAttachment(
            data: data,
            fileName: normalizedFileName(from: fileName, contentType: .mpeg4Audio),
            mimeType: mimeType,
            type: .audio,
            size: data.count,
            width: nil,
            height: nil,
            duration: duration,
            previewImage: nil
        )
    }

    static func from(data: Data, fileName: String, contentType: UTType) -> PendingChatAttachment {
        let mimeType = contentType.preferredMIMEType ?? "application/octet-stream"
        let resolvedFileName = normalizedFileName(from: fileName, contentType: contentType)
        let size = data.count

        if contentType.conforms(to: .image), let image = UIImage(data: data) {
            let jpegData = image.jpegData(compressionQuality: 0.96) ?? data
            let jpegFileName = normalizedFileName(from: fileName, contentType: .jpeg)
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

        if contentType.conforms(to: .movie) || mimeType.hasPrefix("video/") {
            return PendingChatAttachment(
                data: data,
                fileName: resolvedFileName,
                mimeType: mimeType,
                type: .video,
                size: size,
                width: nil,
                height: nil,
                duration: nil,
                previewImage: nil
            )
        }

        if contentType.conforms(to: .audio) || mimeType.hasPrefix("audio/") {
            return PendingChatAttachment(
                data: data,
                fileName: resolvedFileName,
                mimeType: mimeType,
                type: .audio,
                size: size,
                width: nil,
                height: nil,
                duration: audioDuration(from: data),
                previewImage: nil
            )
        }

        return PendingChatAttachment(
            data: data,
            fileName: resolvedFileName,
            mimeType: mimeType,
            type: .file,
            size: size,
            width: nil,
            height: nil,
            duration: nil,
            previewImage: nil
        )
    }

    private static func normalizedFileName(from rawFileName: String, contentType: UTType) -> String {
        let trimmed = rawFileName.trimmingCharacters(in: .whitespacesAndNewlines)
        let preferredExt = contentType.preferredFilenameExtension?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let invalidCharacters = CharacterSet(charactersIn: "/:\\")
        let candidate = trimmed.components(separatedBy: invalidCharacters).last ?? ""
        let baseName = (candidate as NSString).deletingPathExtension.trimmingCharacters(in: .whitespacesAndNewlines)
        let existingExt = (candidate as NSString).pathExtension.trimmingCharacters(in: .whitespacesAndNewlines)
        let resolvedBaseName = baseName.isEmpty ? "attachment-\(UUID().uuidString)" : baseName
        let resolvedExt = existingExt.isEmpty ? preferredExt : existingExt

        guard !resolvedExt.isEmpty else {
            return resolvedBaseName
        }

        return "\(resolvedBaseName).\(resolvedExt)"
    }

    private static func audioDuration(from data: Data) -> Int? {
        guard let player = try? AVAudioPlayer(data: data) else {
            return nil
        }

        return max(1, Int(player.duration.rounded()))
    }
}

private struct ChatDetailTabBarHidingModifier: ViewModifier {
    @ViewBuilder
    func body(content: Content) -> some View {
        content.toolbar(.hidden, for: .tabBar)
    }
}

private struct CameraCaptureView: UIViewControllerRepresentable {
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

private final class FullScreenCameraPickerController: UIImagePickerController {
    override var prefersStatusBarHidden: Bool { true }
    override var preferredStatusBarUpdateAnimation: UIStatusBarAnimation { .fade }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
    }
}

private struct RemoteChatAttachmentImage: View {
    @Environment(AppServices.self) private var services
    let fileId: String
    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .interpolation(.high)
                    .antialiased(true)
                    .scaledToFill()
            } else {
                Rectangle()
                    .fill(.white.opacity(0.06))
                    .overlay {
                        ProgressView()
                    }
            }
        }
        .task(id: fileId) {
            guard image == nil else { return }
            do {
                if let data = try await services.backend.fetchAttachmentData(fileId: fileId),
                   let loadedImage = UIImage(data: data) {
                    image = loadedImage.preparingForDisplay() ?? loadedImage
                }
            } catch {
#if DEBUG
                debugPrint("Attachment image load failed for \(fileId): \(error.localizedDescription)")
#endif
            }
        }
    }
}

private struct ChatAttachmentPreview: Identifiable {
    enum Kind {
        case image
        case video
        case file
    }

    let id = UUID()
    let kind: Kind
    let image: UIImage?
    let fileURL: URL?
    let title: String

    static func make(attachment: MessageAttachmentDTO, kind: Kind, data: Data) throws -> ChatAttachmentPreview {
        switch kind {
        case .image:
            guard let image = UIImage(data: data) else {
                throw AttachmentPreviewError.invalidData
            }
            return ChatAttachmentPreview(
                kind: .image,
                image: image,
                fileURL: nil,
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
                fileURL: url,
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

private enum AttachmentPreviewError: LocalizedError {
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

private struct ChatAttachmentPreviewSheet: View {
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

private struct MessageReadInfoSheet: View {
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

private struct QuickLookPreview: UIViewControllerRepresentable {
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

private enum MessageBubblePosition {
    case single
    case first
    case middle
    case last
}

private struct MessageBubbleShape: Shape {
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
