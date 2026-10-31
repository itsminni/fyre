import Foundation
import XCTest
@testable import Fyre

@MainActor
final class OfflineDemoBackendTests: XCTestCase {
    func testDemoHasIndependentSessionProfileAndReset() async throws {
        let demo = OfflineDemoBackend()
        let account = try await demo.restoreCurrentUser()
        XCTAssertTrue(try XCTUnwrap(account).isProfileComplete)
        var changed = try XCTUnwrap(account)
        changed.bio = "Edited locally"
        _ = try await demo.updateProfile(for: changed)
        let updated = try await demo.restoreCurrentUser()
        XCTAssertEqual(updated?.bio, "Edited locally")
        try await demo.logOut()
        let loggedOut = try await demo.restoreCurrentUser()
        XCTAssertNil(loggedOut)
        await demo.reset()
        let reset = try await demo.restoreCurrentUser()
        XCTAssertNotEqual(reset?.bio, "Edited locally")
    }

    func testMatchesMessagesAttachmentsAndPaginationStayLocal() async throws {
        let demo = OfflineDemoBackend()
        let profiles = try await demo.fetchDiscoverProfiles()
        let first = try XCTUnwrap(profiles.first)
        let matched = try await demo.submitSwipe(otherUserId: first.id, otherUserName: first.name, decision: .liked)
        let thread = try XCTUnwrap(matched)
        let bytes = Data("Local attachment".utf8)
        let attachment = OutgoingAttachmentDTO(data: bytes, fileName: "demo.pdf", mimeType: "application/pdf",
            type: .file, size: bytes.count, width: nil, height: nil, duration: nil)
        let attempt = OutgoingMessageAttempt(draft: .init(text: "Hello", replyToMessageId: nil, attachment: attachment))
        let message = try await demo.sendMessage(threadId: thread.remoteId, attempt: attempt)
        let retry = try await demo.sendMessage(threadId: thread.remoteId, attempt: attempt)
        XCTAssertEqual(message.remoteId, retry.remoteId)
        let saved = try await demo.fetchAttachmentData(fileId: message.attachment!.fileId)
        XCTAssertEqual(saved, bytes)
        let latest = try await demo.fetchThread(threadId: "demo-chat")!
        let older = try await demo.fetchMessagePage(threadId: "demo-chat", before: latest.olderMessagesCursor!)
        let oldest = try await demo.fetchMessagePage(threadId: "demo-chat", before: older.nextCursor!)
        XCTAssertEqual(latest.messages.count + older.messages.count + oldest.messages.count, 120)
        XCTAssertNil(oldest.nextCursor)
    }

    func testCatalogRegistrationCancellationAndAdministration() async throws {
        let demo = OfflineDemoBackend()
        let user = try await demo.restoreCurrentUser()!
        let initial = try await demo.fetchMainEventState(for: user, selectedEventId: nil)!
        XCTAssertEqual(initial.availableEvents.count, 2)
        _ = try await demo.registerForMainEvent(for: user, eventId: initial.eventId)
        _ = try await demo.registerForMainEvent(for: user, eventId: initial.eventId)
        let joined = try await demo.fetchMainEventState(for: user, selectedEventId: initial.eventId)!
        XCTAssertEqual(joined.snapshot.totalCount, initial.snapshot.totalCount + 1)
        try await demo.cancelMainEventRegistration(for: user, eventId: initial.eventId)
        let cancelled = try await demo.fetchMainEventState(for: user, selectedEventId: initial.eventId)!
        XCTAssertEqual(cancelled.currentStatus, .cancelled)
        var draft = EventAdminDraft(state: cancelled.adminState!)
        draft.title = "Changed locally"
        let changed = try await demo.updateMainEventAsAdmin(eventId: initial.eventId, draft: draft)
        XCTAssertEqual(changed.title, "Changed locally")
        _ = try await demo.removeEventParticipantAsAdmin(eventId: initial.eventId, registrationId: "demo-sam")
        let empty = try await demo.fetchMainEventState(for: user, selectedEventId: initial.eventId)!
        XCTAssertEqual(empty.snapshot.totalCount, 0)
    }
}
