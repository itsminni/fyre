//
//  AuthServiceTests.swift
//  Fyre
//
//  Created by Gabriele Mininni on 17/03/26.
//

import XCTest
@testable import Fyre

final class AuthServiceTests: XCTestCase {
    func testEmailValidatorAcceptsValidEmail() {
        XCTAssertTrue(UserStore.isValidEmail("name.surname@example.com"))
    }

    func testEmailValidatorRejectsInvalidEmail() {
        XCTAssertFalse(UserStore.isValidEmail("invalid-email"))
        XCTAssertFalse(UserStore.isValidEmail("name@domain"))
    }

    func testLocalAuthServiceSignUpAndLogin() {
        let service = LocalAuthService()
        let unique = UUID().uuidString.lowercased()
        let email = "\(unique)@example.test"

        switch service.signUp(name: "Test", email: email, password: "password123") {
        case .success(let user):
            XCTAssertEqual(user.email, email)
        case .failure:
            XCTFail("Expected sign up success")
        }

        switch service.logIn(email: email, password: "password123") {
        case .success(let user):
            XCTAssertEqual(user.email, email)
        case .failure:
            XCTFail("Expected login success")
        }
    }
}
