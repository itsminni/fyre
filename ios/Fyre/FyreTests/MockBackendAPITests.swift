//
//  MockBackendAPITests.swift
//  Fyre
//
//  Created by Gabriele Mininni on 17/03/26.
//

import XCTest
@testable import Fyre

final class MockBackendAPITests: XCTestCase {
    func testFetchProfilesReturnsData() async throws {
        let api = MockBackendAPI()
        let profiles = try await api.fetchDiscoverProfiles()
        XCTAssertFalse(profiles.isEmpty)
    }

    func testFetchThreadsReturnsMessages() async throws {
        let api = MockBackendAPI()
        let threads = try await api.fetchThreads()
        XCTAssertFalse(threads.isEmpty)
        XCTAssertFalse(threads[0].messages.isEmpty)
    }
}
