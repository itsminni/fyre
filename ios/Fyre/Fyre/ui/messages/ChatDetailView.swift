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
import QuickLook

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

struct ChatDetailView: View {
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
    @State private var threadLastSeenAt: Date?
    @State private var otherParticipantReadAt: Date?
    @State private var messages: [ChatMessage]
    @State private var draft = ""
    @State private var pendingAttachment: PendingChatAttachment?
    @State private var pickedAttachmentItem: PhotosPickerItem?
    @State private var attachmentPickerMode: AttachmentPickerMode = .photos
    @State private var isCameraPresented = false
    @State private var isAttachmentPickerPresented = false
    @State private var isAttachmentTrayPresented = false
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
    @State private var isDeleteChatConfirmationPresented = false
    @State private var messageReadInfoMessage: ChatMessage?
    @FocusState private var isInputFocused: Bool

    init(thread: ChatThread) {
        self.thread = thread
        _threadName = State(initialValue: thread.name)
        _threadAvatar = State(initialValue: thread.avatar)
        _threadIsOnline = State(initialValue: thread.isOnline)
        _threadLastSeenAt = State(initialValue: thread.lastSeenAt)
        _otherParticipantReadAt = State(initialValue: thread.otherParticipantReadAt)
        _messages = State(initialValue: thread.messages)
    }

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(messages.enumerated()), id: \.element.id) { index, message in
                            let bubblePosition = bubblePosition(for: index)
                            let bubbleHorizontalPadding = bubbleHorizontalPadding(for: message)
                            let bubbleVerticalPadding = bubbleVerticalPadding(for: message)
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
                                    VStack(alignment: message.isMe ? .trailing : .leading, spacing: 3) {
                                        Group {
                                            if isImageOnlyMessage(message) {
                                                if let attachment = message.attachment {
                                                    messageAttachmentView(
                                                        attachment: attachment,
                                                        messageType: message.messageType
                                                    )
                                                }
                                            } else {
                                                VStack(alignment: .leading, spacing: message.replyPreviewText == nil ? 0 : 8) {
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
                                                            messageType: message.messageType
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
                                        }
                                        .padding(.horizontal, isImageOnlyMessage(message) ? 0 : bubbleHorizontalPadding)
                                        .padding(.vertical, isImageOnlyMessage(message) ? 0 : bubbleVerticalPadding)
                                        .background {
                                            if !isImageOnlyMessage(message) {
                                                messageBubbleChrome(
                                                    isOutgoing: message.isMe,
                                                    position: bubblePosition
                                                )
                                            }
                                        }
                                        .fixedSize(horizontal: false, vertical: true)
                                        .frame(
                                            maxWidth: isImageOnlyMessage(message)
                                                ? min(messageMaxWidth + 24, 292)
                                                : messageMaxWidth,
                                            alignment: message.isMe ? .trailing : .leading
                                        )
                                        .shadow(
                                            color: isImageOnlyMessage(message)
                                                ? .black.opacity(colorScheme == .dark ? 0.26 : 0.12)
                                                : messageBubbleShadow(isOutgoing: message.isMe),
                                            radius: isImageOnlyMessage(message) ? 12 : (colorScheme == .dark ? 0 : 6),
                                            y: isImageOnlyMessage(message) ? 6 : (colorScheme == .dark ? 0 : 3)
                                        )
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
                                            let showsTimestamp = shouldShowTimestamp(for: index)
                                            let receiptLabel = readReceiptLabel(for: message)

                                            HStack(spacing: 4) {
                                                if showsTimestamp {
                                                    Text(message.time)
                                                        .font(.caption2)
                                                        .foregroundStyle(messageMetadataForegroundStyle)
                                                }

                                                if showsTimestamp, receiptLabel != nil {
                                                    Text("•")
                                                        .font(.caption2)
                                                        .foregroundStyle(messageMetadataForegroundStyle)
                                                }

                                                if let receiptLabel {
                                                    Text(receiptLabel)
                                                        .font(.caption2.weight(.semibold))
                                                        .foregroundStyle(messageMetadataForegroundStyle)
                                                }
                                            }
                                            .shadow(
                                                color: isLightChatBackground ? .white.opacity(0.16) : .black.opacity(0.22),
                                                radius: 1,
                                                y: 1
                                            )
                                            .padding(.horizontal, 2)
                                            .padding(.top, 1)
                                            .opacity(isAnimating(message) ? 0.5 : 1)
                                        }
                                    }
                                    .id(message.id)
                                    .scaleEffect(
                                        isAnimating(message) ? 0.94 : 1,
                                        anchor: message.isMe ? .trailing : .leading
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
                    }
                    .padding(.top, messageListTopInset)
                    .padding(.bottom, messageListBottomInset)

                    Color.clear
                        .frame(height: 1)
                        .background {
                            GeometryReader { geometry in
                                Color.clear.preference(
                                    key: ChatBottomAnchorMinYPreferenceKey.self,
                                    value: geometry.frame(in: .named("chatScrollView")).minY
                                )
                            }
                        }
                }
                .defaultScrollAnchor(.bottom)
                .coordinateSpace(name: "chatScrollView")
                .background {
                    GeometryReader { geometry in
                        Color.clear.preference(
                            key: ChatScrollViewportHeightPreferenceKey.self,
                            value: geometry.size.height
                        )
                    }
                }
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
        .overlay(alignment: .bottom) {
            if #available(iOS 26.0, *) {
                composerOverlay
                    .ignoresSafeArea(.container, edges: .bottom)
                    .ignoresSafeArea(.keyboard, edges: .bottom)
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if #unavailable(iOS 26.0) {
                composerOverlay
            }
        }
        .navigationTitle(navigationTitleText)
        .navigationBarTitleDisplayMode(.inline)
        .modifier(ChatDetailTabBarHidingModifier())
        .modifier(ChatDetailNavigationBarModifier(colorScheme: colorScheme))
        .toolbar {
            ToolbarItem(placement: .principal) {
                if #available(iOS 26.0, *) {
                    ios26ProfileHeader
                } else {
                    HStack(spacing: 8) {
                        ChatAvatarView(
                            name: threadName,
                            avatarKey: threadAvatar,
                            size: 30,
                            isOnline: threadIsOnline,
                            showsPresence: true
                        )

                        VStack(alignment: .leading, spacing: 1) {
                            Text(threadName)
                                .font(.headline.weight(.semibold))
                                .lineLimit(1)

                            if threadIsOnline {
                                Text(L10n.tr("messages.online"))
                                    .font(.caption2)
                                    .foregroundStyle(.green)
                            } else if let threadLastSeenAt {
                                Text(String(format: L10n.tr("messages.lastSeen"), lastSeenLabel(for: threadLastSeenAt)))
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }

            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button {
                        isDeleteChatConfirmationPresented = true
                    } label: {
                        HStack(spacing: 12) {
                            Text(L10n.tr("messages.delete.action"))
                                .foregroundStyle(.red)
                            Spacer(minLength: 0)
                            Image(systemName: "trash")
                                .foregroundStyle(.red)
                        }
                        .symbolRenderingMode(.monochrome)
                        .contentShape(Rectangle())
                    }
                } label: {
                    Image(systemName: "ellipsis")
                        .font(.headline.weight(.semibold))
                        .frame(width: 32, height: 32)
                }
                .buttonStyle(.plain)
                .tint(.primary)
            }
        }
        .task {
            await reloadThread()
            startRealtime()
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
        }
        .fileImporter(
            isPresented: $isAttachmentFileImporterPresented,
            allowedContentTypes: [.image, .movie, .pdf, .data]
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
        .alert(
            L10n.tr("messages.delete.confirmTitle"),
            isPresented: $isDeleteChatConfirmationPresented
        ) {
            Button(L10n.tr("messages.delete.action"), role: .destructive) {
                deleteCurrentThread()
            }
            Button(L10n.tr("common.cancel"), role: .cancel) {}
        } message: {
            Text(String(format: L10n.tr("messages.delete.confirmMessage"), threadName))
        }
    }

    @ViewBuilder
    private var composerOverlay: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let sendErrorMessage {
                if #available(iOS 26.0, *) {
                    Text(sendErrorMessage)
                        .font(.caption)
                        .foregroundStyle(.red)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .glassEffect(in: Capsule(style: .continuous))
                        .frame(maxWidth: .infinity, alignment: .leading)
                } else {
                    Text(sendErrorMessage)
                        .font(.caption)
                        .foregroundStyle(.red)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }

            if let replyingToMessage {
                replyComposerPreview(replyingToMessage)
            }

            composerRow

            if isAttachmentTrayPresented {
                attachmentTray
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, composerBottomPadding)
        .background(composerChrome)
    }

    private func sendMessage() {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty || pendingAttachment != nil else { return }
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
        (!draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || pendingAttachment != nil) && !isSending
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
    private var composerChrome: some View {
        if #available(iOS 26.0, *) {
            Color.clear
        } else {
            Rectangle()
                .fill(chatChromeBackground)
            .ignoresSafeArea(edges: .bottom)
            .overlay(alignment: .top) {
                Rectangle()
                    .fill(colorScheme == .dark ? .white.opacity(0.16) : .black.opacity(0.10))
                    .frame(height: 1)
            }
        }
    }

    @ViewBuilder
    private var composerFieldChrome: some View {
        Capsule(style: .continuous)
            .fill(Color(uiColor: .secondarySystemFill))
            .overlay {
                Capsule(style: .continuous)
                    .stroke(.white.opacity(colorScheme == .dark ? 0.08 : 0.12), lineWidth: 1)
            }
    }

    private var composerBottomPadding: CGFloat {
        if #available(iOS 26.0, *) {
            return 6
        }

        return 8
    }

    private var messageListTopInset: CGFloat {
        0
    }

    private var messageListBottomInset: CGFloat {
        if #unavailable(iOS 26.0) {
            return 10
        }

        var inset: CGFloat = 76 + composerOverlayBottomInset

        if replyingToMessage != nil {
            inset += 56
        }

        if isAttachmentTrayPresented {
            inset += 84
        }

        if sendErrorMessage != nil {
            inset += 34
        }

        return inset
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
        if #unavailable(iOS 26.0) {
            return 18
        }

        var padding: CGFloat = 68 + composerOverlayBottomInset

        if replyingToMessage != nil {
            padding += 60
        }

        if isAttachmentTrayPresented {
            padding += 82
        }

        return padding
    }

    private var scrollToLatestButtonForeground: AnyShapeStyle {
        if #available(iOS 26.0, *) {
            return AnyShapeStyle(.white.opacity(0.96))
        }

        return AnyShapeStyle(colorScheme == .dark ? .white.opacity(0.92) : .primary.opacity(0.88))
    }

    @ViewBuilder
    private var scrollToLatestButtonChrome: some View {
        if #available(iOS 26.0, *) {
            Circle()
                .fill(.clear)
                .glassEffect(in: Circle())
        } else {
            Circle()
                .fill(.regularMaterial)
                .overlay {
                    Circle()
                        .stroke(.white.opacity(colorScheme == .dark ? 0.12 : 0.18), lineWidth: 1)
                }
                .shadow(color: .black.opacity(colorScheme == .dark ? 0.28 : 0.10), radius: 8, y: 3)
        }
    }

    @ViewBuilder
    private var composerAttachmentButton: some View {
        if #available(iOS 26.0, *) {
            Image(systemName: "plus")
                .font(.headline.weight(.semibold))
                .foregroundStyle(.white.opacity(0.88))
                .frame(width: 30, height: 30)
                .contentShape(Rectangle())
        } else {
            Image(systemName: "plus")
                .font(.headline.weight(.semibold))
                .foregroundStyle(.secondary)
                .frame(width: 30, height: 30)
        }
    }

    @available(iOS 26.0, *)
    private var ios26ProfileHeader: some View {
        HStack(spacing: 8) {
            ChatAvatarView(
                name: threadName,
                avatarKey: threadAvatar,
                size: 28,
                isOnline: threadIsOnline,
                showsPresence: true
            )

            VStack(alignment: .leading, spacing: 1) {
                Text(threadName)
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(.white)
                    .lineLimit(1)

                if let subtitle = threadPresenceSubtitle {
                    Text(subtitle)
                        .font(.caption2)
                        .foregroundStyle(threadIsOnline ? .green.opacity(0.95) : .white.opacity(0.84))
                        .lineLimit(1)
                }
            }
        }
        .frame(maxWidth: .infinity)
    }

    private var threadPresenceSubtitle: String? {
        if threadIsOnline {
            return L10n.tr("messages.online")
        }

        guard let threadLastSeenAt else {
            return nil
        }

        return String(format: L10n.tr("messages.lastSeen"), lastSeenLabel(for: threadLastSeenAt))
    }

    private var navigationTitleText: String {
        return ""
    }

    private var messageMetadataForegroundStyle: AnyShapeStyle {
        AnyShapeStyle(isLightChatBackground ? Color.black.opacity(0.48) : Color.white.opacity(0.74))
    }

    @ViewBuilder
    private var composerRow: some View {
        if #available(iOS 26.0, *) {
            Group {
                if isInputFocused {
                    HStack(alignment: .center, spacing: 10) {
                        composerAttachmentToggleButton

                        HStack(alignment: .center, spacing: 8) {
                            if let pendingAttachment {
                                composerIntegratedAttachmentPreview(pendingAttachment)
                            }

                            composerTextField
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(composerFieldChrome)

                        composerSendButton(size: 44)
                    }
                } else {
                    HStack(alignment: .center, spacing: 8) {
                        composerAttachmentToggleButton
                            .frame(width: 32, height: 32)

                        HStack(alignment: .center, spacing: 8) {
                            if let pendingAttachment {
                                composerIntegratedAttachmentPreview(pendingAttachment)
                            }

                            composerTextField
                        }

                        composerSendButton(size: 38)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(composerFieldChrome)
                }
            }
            .animation(.spring(response: 0.30, dampingFraction: 0.86), value: isInputFocused)
        } else {
            HStack(alignment: .center, spacing: 10) {
                HStack(alignment: .center, spacing: 8) {
                    Button {
                        withAnimation(.spring(response: 0.28, dampingFraction: 0.86)) {
                            isAttachmentTrayPresented.toggle()
                        }
                    } label: {
                        composerAttachmentButton
                    }
                    .buttonStyle(.plain)

                    if let pendingAttachment {
                        composerIntegratedAttachmentPreview(pendingAttachment)
                    }

                    TextField(L10n.tr("chat.message.placeholder"), text: $draft, axis: .vertical)
                        .focused($isInputFocused)
                        .textFieldStyle(.plain)
                        .submitLabel(.send)
                        .onSubmit(sendMessage)
                        .lineLimit(1...4)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(composerFieldChrome)

                LiquidStretchSendButton(
                    isEnabled: canSendMessage,
                    action: sendMessage,
                    size: 44,
                    gradientColors: sendButtonGradientColors
                )
            }
        }
    }

    private var composerAttachmentToggleButton: some View {
        Button {
            withAnimation(.spring(response: 0.28, dampingFraction: 0.86)) {
                isAttachmentTrayPresented.toggle()
            }
        } label: {
            composerAttachmentButton
        }
        .buttonStyle(.plain)
    }

    private var composerTextField: some View {
        TextField(L10n.tr("chat.message.placeholder"), text: $draft, axis: .vertical)
            .focused($isInputFocused)
            .textFieldStyle(.plain)
            .submitLabel(.send)
            .onSubmit(sendMessage)
            .lineLimit(1...4)
    }

    private func composerSendButton(size: CGFloat) -> some View {
        LiquidStretchSendButton(
            isEnabled: canSendMessage,
            action: sendMessage,
            size: size,
            gradientColors: sendButtonGradientColors
        )
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

            let luminance = colors
                .map(\.perceivedLuminance)
                .reduce(0, +) / Double(colors.count)
            return luminance >= 0.62
        }
    }

    private var composerOverlayBottomInset: CGFloat {
        max(windowSafeAreaBottomInset - 8, 6)
    }

    private var windowSafeAreaBottomInset: CGFloat {
        let windowScene = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }
        let keyWindow = windowScene?.windows.first(where: \.isKeyWindow)
        return keyWindow?.safeAreaInsets.bottom ?? 0
    }

    private func messageTextStyle(isOutgoing: Bool) -> AnyShapeStyle {
        let palette = isOutgoing ? outgoingBubbleStyle : incomingBubbleStyle
        return AnyShapeStyle(palette.textColor(colorScheme: colorScheme, isOutgoing: isOutgoing))
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
        case .file:
            return message.attachment?.name ?? L10n.tr("chat.attachment.file")
        case .text:
            return ""
        }
    }

    private func attachmentPreviewTitle(for attachment: PendingChatAttachment) -> String {
        switch attachment.type {
        case .image:
            return L10n.tr("chat.attachment.photo")
        case .video:
            return L10n.tr("chat.attachment.video")
        case .file:
            return L10n.tr("chat.attachment.file")
        case .text:
            return L10n.tr("chat.attachment.file")
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
        HStack(spacing: 10) {
            RoundedRectangle(cornerRadius: 2, style: .continuous)
                .fill(.orange)
                .frame(width: 4, height: 34)

            VStack(alignment: .leading, spacing: 2) {
                Text(message.isMe ? L10n.tr("chat.reply.you") : threadName)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)

                Text(replyPreviewText(for: message))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer(minLength: 0)

            Button {
                replyingToMessage = nil
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.title3)
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(.white.opacity(colorScheme == .dark ? 0.05 : 0.08), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
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
                    replyingToMessage = message
                    isInputFocused = true
                } else if message.isMe, value.translation.width >= 54 {
                    messageReadInfoMessage = message
                } else if !message.isMe, value.translation.width >= 54 {
                    replyingToMessage = message
                    isInputFocused = true
                }
            }
    }

    @ViewBuilder
    private func composerIntegratedAttachmentPreview(_ attachment: PendingChatAttachment) -> some View {
        HStack(spacing: 8) {
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
            .frame(width: 42, height: 42)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

            VStack(alignment: .leading, spacing: 2) {
                Text(attachmentPreviewTitle(for: attachment))
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(1)

                Text(attachment.fileName)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Button {
                pendingAttachment = nil
            } label: {
                Image(systemName: "xmark")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.secondary)
                    .frame(width: 22, height: 22)
                    .background(.white.opacity(colorScheme == .dark ? 0.10 : 0.14), in: Circle())
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .frame(maxWidth: 172)
        .background(.white.opacity(colorScheme == .dark ? 0.06 : 0.08), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(.white.opacity(colorScheme == .dark ? 0.08 : 0.10), lineWidth: 1)
        }
    }

    private var attachmentTray: some View {
        HStack(spacing: 16) {
            attachmentTrayAction(
                icon: "photo",
                title: L10n.tr("chat.attachment.media")
            ) {
                isAttachmentTrayPresented = false
                attachmentPickerMode = .media
                isAttachmentPickerPresented = true
            }

            attachmentTrayAction(
                icon: "doc",
                title: L10n.tr("chat.attachment.file")
            ) {
                isAttachmentTrayPresented = false
                isAttachmentFileImporterPresented = true
            }

            if UIImagePickerController.isSourceTypeAvailable(.camera) {
                attachmentTrayAction(
                    icon: "camera",
                    title: L10n.tr("chat.attachment.camera")
                ) {
                    isAttachmentTrayPresented = false
                    isCameraPresented = true
                }
            }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(attachmentTrayChrome)
    }

    @ViewBuilder
    private var attachmentTrayChrome: some View {
        RoundedRectangle(cornerRadius: 24, style: .continuous)
            .fill(.ultraThinMaterial)
            .overlay {
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .stroke(.white.opacity(colorScheme == .dark ? 0.12 : 0.10), lineWidth: 1)
            }
    }

    private func attachmentTrayAction(icon: String, title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(attachmentTrayIconForeground)
                    .frame(width: 46, height: 46)
                    .background(attachmentTrayIconChrome)

                Text(title)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
    }

    private var attachmentTrayIconForeground: AnyShapeStyle {
        if #available(iOS 26.0, *) {
            return AnyShapeStyle(.orange)
        }

        return AnyShapeStyle(.white)
    }

    @ViewBuilder
    private var attachmentTrayIconChrome: some View {
        if #available(iOS 26.0, *) {
            Circle()
                .fill(.clear)
                .glassEffect(in: Circle())
        } else {
            Circle()
                .fill(
                    LinearGradient(
                        colors: [
                            Color.orange.opacity(0.96),
                            Color.orange.opacity(0.78)
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
        }
    }

    private func deleteCurrentThread() {
        NotificationCenter.default.post(name: .fyreThreadRemoved, object: thread.remoteId)
        NotificationCenter.default.post(name: .fyreThreadsDidChange, object: nil)
        dismiss()
    }

    @ViewBuilder
    private func messageAttachmentView(attachment: MessageAttachmentDTO, messageType: MessageTypeDTO) -> some View {
        switch messageType {
        case .image:
            RemoteChatAttachmentImage(fileId: attachment.fileId)
                .frame(maxWidth: min(messageMaxWidth + 24, 292), maxHeight: 292)
                .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .stroke(.white.opacity(colorScheme == .dark ? 0.12 : 0.18), lineWidth: 1)
                }
                .contentShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
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
                return
            }

            let refreshedMessages = dto.messages.map(ChatMessage.init(dto:))

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
                threadLastSeenAt = dto.lastSeenAt
                otherParticipantReadAt = dto.otherParticipantReadAt
            }
            await services.backend.markThreadRead(threadId: thread.remoteId)
        } catch {
#if DEBUG
            debugPrint("Chat refresh failed for \(thread.remoteId): \(error.localizedDescription)")
#endif
        }
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

    private func lastSeenLabel(for date: Date) -> String {
        if Calendar.current.isDateInToday(date) {
            return Self.messageTimeFormatter.string(from: date)
        }

        return Self.lastSeenDateTimeFormatter.string(from: date)
    }

    private static let lastSeenDateTimeFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "it_IT")
        formatter.dateStyle = .short
        formatter.timeStyle = .short
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
}

private struct ChatDetailTabBarHidingModifier: ViewModifier {
    @ViewBuilder
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content.background {
                ChatTabBarVisibilityController(isHidden: true)
            }
        } else {
            content.toolbar(.hidden, for: .tabBar)
        }
    }
}

private struct ChatDetailNavigationBarModifier: ViewModifier {
    let colorScheme: ColorScheme

    @ViewBuilder
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content
        } else {
            content
                .toolbarBackground(.visible, for: .navigationBar)
                .toolbarBackground(navigationBarBackground, for: .navigationBar)
                .toolbarColorScheme(colorScheme == .dark ? .dark : .light, for: .navigationBar)
        }
    }

    private var navigationBarBackground: some ShapeStyle {
        chatChromeBackground
    }

    private var chatChromeBackground: some ShapeStyle {
        if colorScheme == .dark {
            return AnyShapeStyle(.regularMaterial)
        }

        return AnyShapeStyle(Color(uiColor: .systemBackground))
    }
}

private struct ChatTabBarVisibilityController: UIViewControllerRepresentable {
    let isHidden: Bool

    func makeUIViewController(context: Context) -> Controller {
        Controller()
    }

    func updateUIViewController(_ uiViewController: Controller, context: Context) {
        uiViewController.setTabBarHidden(isHidden)
    }

    final class Controller: UIViewController {
        private var wantsHidden = false
        private var lastAppliedHidden: Bool?

        override func viewWillAppear(_ animated: Bool) {
            super.viewWillAppear(animated)
            applyTabBarVisibility()
        }

        override func viewDidAppear(_ animated: Bool) {
            super.viewDidAppear(animated)
            applyTabBarVisibility()
        }

        override func viewWillDisappear(_ animated: Bool) {
            super.viewWillDisappear(animated)
            restoreTabBar()
        }

        func setTabBarHidden(_ hidden: Bool) {
            guard wantsHidden != hidden else { return }
            wantsHidden = hidden
            applyTabBarVisibility()
        }

        private func applyTabBarVisibility() {
            guard let tabBar = tabBarController?.tabBar else { return }
            guard lastAppliedHidden != wantsHidden else { return }
            lastAppliedHidden = wantsHidden

            UIView.performWithoutAnimation {
                tabBar.isHidden = wantsHidden
                tabBarController?.additionalSafeAreaInsets.bottom = wantsHidden ? -tabBar.bounds.height : 0
                tabBarController?.view.setNeedsLayout()
                tabBarController?.view.layoutIfNeeded()
            }
        }

        private func restoreTabBar() {
            guard let tabBar = tabBarController?.tabBar else { return }
            guard lastAppliedHidden != false else { return }
            lastAppliedHidden = false

            UIView.performWithoutAnimation {
                tabBar.isHidden = false
                tabBarController?.additionalSafeAreaInsets.bottom = 0
                tabBarController?.view.setNeedsLayout()
                tabBarController?.view.layoutIfNeeded()
            }
        }
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
                title: attachment.name ?? L10n.tr("chat.attachment.photo")
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

        let cleanedBaseName = (fileName?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
            ? fileName!
            : UUID().uuidString)
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
                }

                Section {
                    infoRow(
                        title: L10n.tr("chat.messageInfo.sent"),
                        value: Self.dateFormatter.string(from: message.sentAt)
                    )

                    infoRow(
                        title: L10n.tr("chat.messageInfo.read"),
                        value: readAt.map { Self.dateFormatter.string(from: $0) } ?? L10n.tr("chat.messageInfo.unread")
                    )
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

                    if let name = attachment.name, !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        Text(name)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                    }
                }

                Spacer(minLength: 0)
            }

        case .video, .file:
            HStack(spacing: 12) {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(.white.opacity(0.06))
                    .frame(width: 76, height: 76)
                    .overlay {
                        Image(systemName: message.messageType == .video ? "video.fill" : "doc.fill")
                            .font(.title2.weight(.semibold))
                            .foregroundStyle(.orange)
                    }

                VStack(alignment: .leading, spacing: 4) {
                    Text(message.messageType == .video ? L10n.tr("chat.attachment.video") : L10n.tr("chat.attachment.file"))
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
