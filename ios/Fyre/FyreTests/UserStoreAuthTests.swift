//
//  UserStoreAuthTests.swift
//  Fyre
//
//  Created by Gabriele Mininni on 17/03/26.
//

import XCTest
@testable import Fyre

final class UserStoreAuthTests: XCTestCase {
    func testEmailValidatorAcceptsValidEmail() {
        XCTAssertTrue(UserStore.isValidEmail("name.surname@example.com"))
    }

    func testEmailValidatorRejectsInvalidEmail() {
        XCTAssertFalse(UserStore.isValidEmail("invalid-email"))
        XCTAssertFalse(UserStore.isValidEmail("name@domain"))
    }

    func testEmailValidatorRejectsEmailsWithSpaces() {
        XCTAssertFalse(UserStore.isValidEmail("name surname@example.com"))
        XCTAssertFalse(UserStore.isValidEmail(" name@example.com"))
        XCTAssertFalse(UserStore.isValidEmail("name@example.com "))
    }

    func testUserStoreSignUpAndLogin() {
        resetLocalStoreState()
        let store = UserStore.shared
        let unique = UUID().uuidString.lowercased()
        let email = "\(unique)@example.test"

        XCTAssertNil(store.signUp(email: email, password: "password123"))
        XCTAssertEqual(store.currentUser?.email, email)

        store.logOut()
        XCTAssertNil(store.currentUser)

        XCTAssertNil(store.logIn(email: email, password: "password123"))
        XCTAssertEqual(store.currentUser?.email, email)
    }

    func testSignUpRejectsEmailsWithSpaces() {
        resetLocalStoreState()
        let store = UserStore.shared

        let error = store.signUp(email: "name surname@example.com", password: "password123")
        XCTAssertEqual(error, L10n.tr("error.auth.invalidEmail"))
        XCTAssertNil(store.currentUser)
    }

    func testMainEventAllowsSameGenderRegistrationsBeforeGenderCap() {
        resetLocalStoreState()
        let store = UserStore.shared

        let maleAEmail = "\(UUID().uuidString.lowercased())@example.test"
        let maleBEmail = "\(UUID().uuidString.lowercased())@example.test"

        registerEventEligibleUser(store: store, email: maleAEmail, gender: .male, firstName: "Male", lastName: "A")
        XCTAssertNil(store.registerForMainEvent())

        registerEventEligibleUser(store: store, email: maleBEmail, gender: .male, firstName: "Male", lastName: "B")
        XCTAssertNil(store.registerForMainEvent())

        let snapshot = store.mainEventSnapshot
        XCTAssertEqual(snapshot.maleCount, 2)
        XCTAssertEqual(snapshot.femaleCount, 0)
        XCTAssertEqual(snapshot.waitingListCount, 0)
        XCTAssertTrue(store.isCurrentUserRegisteredForMainEvent)
        XCTAssertFalse(store.isCurrentUserWaitingForMainEvent)
    }

    func testMainEventWaitlistsAfterGenderCapAndPromotesWhenSameGenderSlotOpens() {
        resetLocalStoreState()
        let store = UserStore.shared
        let confirmedMaleEmails = fillMainEventSlots(store: store, count: 24, gender: .male, emailPrefix: "confirmed-male")
        let waitingEmail = "\(UUID().uuidString.lowercased())@example.test"

        registerEventEligibleUser(store: store, email: waitingEmail, gender: .male, firstName: "Waiting", lastName: "Male")
        XCTAssertEqual(store.registerForMainEvent(), L10n.tr("events.success.waitlisted"))
        XCTAssertEqual(store.mainEventSnapshot.maleCount, 24)
        XCTAssertEqual(store.mainEventSnapshot.waitingListCount, 1)
        XCTAssertTrue(store.isCurrentUserWaitingForMainEvent)

        XCTAssertNil(store.logIn(email: confirmedMaleEmails[0], password: "password123"))
        XCTAssertNil(store.cancelMainEventRegistration())

        let snapshot = store.mainEventSnapshot
        XCTAssertEqual(snapshot.maleCount, 24)
        XCTAssertEqual(snapshot.waitingListCount, 0)

        XCTAssertNil(store.logIn(email: waitingEmail, password: "password123"))
        XCTAssertTrue(store.isCurrentUserRegisteredForMainEvent)
        XCTAssertFalse(store.isCurrentUserWaitingForMainEvent)
    }

    func testMainEventCanLeaveWaitingList() {
        resetLocalStoreState()
        let store = UserStore.shared

        let maleBEmail = "\(UUID().uuidString.lowercased())@example.test"

        _ = fillMainEventSlots(store: store, count: 24, gender: .male, emailPrefix: "filled-male")
        registerEventEligibleUser(store: store, email: maleBEmail, gender: .male, firstName: "Male", lastName: "B")
        XCTAssertEqual(store.registerForMainEvent(), L10n.tr("events.success.waitlisted"))
        XCTAssertEqual(store.mainEventSnapshot.waitingListCount, 1)
        XCTAssertTrue(store.isCurrentUserWaitingForMainEvent)

        XCTAssertNil(store.cancelMainEventRegistration())
        XCTAssertEqual(store.mainEventSnapshot.waitingListCount, 0)
        XCTAssertFalse(store.isCurrentUserWaitingForMainEvent)
    }

    func testChangingOrientationAutomaticallyCancelsEventRegistration() {
        resetLocalStoreState()
        let store = UserStore.shared
        let email = "\(UUID().uuidString.lowercased())@example.test"

        XCTAssertNil(store.signUp(email: email, password: "password123"))
        XCTAssertNil(store.setProfileGender(.male))
        XCTAssertNil(store.updateProfile(
            firstName: "A",
            lastName: "B",
            birthDate: Calendar.current.date(byAdding: .year, value: -28, to: Date()),
            orientation: .straight,
            smokes: false,
            drinks: true,
            hobbies: "",
            passions: "",
            lookingFor: "",
            favoriteSong: "",
            favoriteMovie: ""
        ))
        XCTAssertNil(store.registerForMainEvent())
        XCTAssertTrue(store.isCurrentUserRegisteredForMainEvent)

        XCTAssertNil(store.updateProfile(
            firstName: "A",
            lastName: "B",
            birthDate: Calendar.current.date(byAdding: .year, value: -28, to: Date()),
            orientation: .bisexual,
            smokes: false,
            drinks: true,
            hobbies: "",
            passions: "",
            lookingFor: "",
            favoriteSong: "",
            favoriteMovie: ""
        ))
        XCTAssertFalse(store.isCurrentUserRegisteredForMainEvent)
    }

    func testChangingGenderAutomaticallyCancelsEventRegistration() {
        resetLocalStoreState()
        let store = UserStore.shared
        let email = "\(UUID().uuidString.lowercased())@example.test"

        XCTAssertNil(store.signUp(email: email, password: "password123"))
        XCTAssertNil(store.setProfileGender(.male))
        XCTAssertNil(store.updateProfile(
            firstName: "A",
            lastName: "B",
            birthDate: Calendar.current.date(byAdding: .year, value: -28, to: Date()),
            orientation: .straight,
            smokes: false,
            drinks: true,
            hobbies: "",
            passions: "",
            lookingFor: "",
            favoriteSong: "",
            favoriteMovie: ""
        ))
        XCTAssertNil(store.registerForMainEvent())
        XCTAssertTrue(store.isCurrentUserRegisteredForMainEvent)

        XCTAssertNil(store.setProfileGender(.other))
        XCTAssertFalse(store.isCurrentUserRegisteredForMainEvent)
    }

    func testMainEventRejectsNonStraightOrientation() {
        resetLocalStoreState()
        let store = UserStore.shared
        let email = "\(UUID().uuidString.lowercased())@example.test"

        XCTAssertNil(store.signUp(email: email, password: "password123"))
        XCTAssertNil(store.setProfileGender(.female))
        XCTAssertNil(store.updateProfile(
            firstName: "A",
            lastName: "B",
            birthDate: Calendar.current.date(byAdding: .year, value: -24, to: Date()),
            orientation: .bisexual,
            smokes: false,
            drinks: true,
            hobbies: "",
            passions: "",
            lookingFor: "",
            favoriteSong: "",
            favoriteMovie: ""
        ))

        let error = store.registerForMainEvent()
        XCTAssertEqual(error, L10n.tr("events.error.orientationUnsupported"))
        XCTAssertFalse(store.isCurrentUserRegisteredForMainEvent)
    }

    func testMainEventRejectsOtherGender() {
        resetLocalStoreState()
        let store = UserStore.shared
        let email = "\(UUID().uuidString.lowercased())@example.test"

        XCTAssertNil(store.signUp(email: email, password: "password123"))
        XCTAssertNil(store.setProfileGender(.other))
        XCTAssertNil(store.updateProfile(
            firstName: "A",
            lastName: "B",
            birthDate: Calendar.current.date(byAdding: .year, value: -24, to: Date()),
            orientation: .straight,
            smokes: false,
            drinks: true,
            hobbies: "",
            passions: "",
            lookingFor: "",
            favoriteSong: "",
            favoriteMovie: ""
        ))

        let error = store.registerForMainEvent()
        XCTAssertEqual(error, L10n.tr("events.error.genderUnsupported"))
        XCTAssertFalse(store.isCurrentUserRegisteredForMainEvent)
    }

    func testChangingOrientationWarnsAndRemovesConfirmedRegistration() {
        resetLocalStoreState()
        let store = UserStore.shared
        let email = "\(UUID().uuidString.lowercased())@example.test"

        XCTAssertNil(store.signUp(email: email, password: "password123"))
        XCTAssertNil(store.setProfileGender(.male))
        XCTAssertNil(store.updateProfile(
            firstName: "A",
            lastName: "B",
            birthDate: Calendar.current.date(byAdding: .year, value: -29, to: Date()),
            orientation: .straight,
            smokes: false,
            drinks: true,
            hobbies: "",
            passions: "",
            lookingFor: "",
            favoriteSong: "",
            favoriteMovie: ""
        ))
        XCTAssertNil(store.registerForMainEvent())
        XCTAssertTrue(store.isCurrentUserRegisteredForMainEvent)
        XCTAssertTrue(store.willCurrentUserLoseMainEventRegistrations(orientation: .bisexual))

        XCTAssertNil(store.updateProfile(
            firstName: "A",
            lastName: "B",
            birthDate: Calendar.current.date(byAdding: .year, value: -29, to: Date()),
            orientation: .bisexual,
            smokes: false,
            drinks: true,
            hobbies: "",
            passions: "",
            lookingFor: "",
            favoriteSong: "",
            favoriteMovie: ""
        ))

        XCTAssertFalse(store.isCurrentUserRegisteredForMainEvent)
        XCTAssertFalse(store.isCurrentUserWaitingForMainEvent)
    }

    func testChangingGenderWarnsAndRemovesWaitingListRegistration() {
        resetLocalStoreState()
        let store = UserStore.shared
        let waitingEmail = "\(UUID().uuidString.lowercased())@example.test"

        _ = fillMainEventSlots(store: store, count: 24, gender: .male, emailPrefix: "seeded-male")
        registerEventEligibleUser(store: store, email: waitingEmail, gender: .male, firstName: "Second", lastName: "User")

        XCTAssertEqual(store.registerForMainEvent(), L10n.tr("events.success.waitlisted"))
        XCTAssertTrue(store.isCurrentUserWaitingForMainEvent)
        XCTAssertTrue(store.willCurrentUserLoseMainEventRegistrations(changingGenderTo: .other))

        XCTAssertNil(store.setProfileGender(.other))

        XCTAssertFalse(store.isCurrentUserRegisteredForMainEvent)
        XCTAssertFalse(store.isCurrentUserWaitingForMainEvent)
    }

    func testUpdateProfilePersistsShowMePreference() {
        resetLocalStoreState()
        let store = UserStore.shared
        let email = "\(UUID().uuidString.lowercased())@example.test"

        XCTAssertNil(store.signUp(email: email, password: "password123"))
        XCTAssertNil(store.setProfileGender(.male))
        XCTAssertNil(store.updateProfile(
            firstName: "A",
            lastName: "B",
            birthDate: Calendar.current.date(byAdding: .year, value: -28, to: Date()),
            orientation: .straight,
            showMe: .women,
            smokes: false,
            drinks: true,
            hobbies: "",
            passions: "",
            lookingFor: "",
            favoriteSong: "",
            favoriteMovie: ""
        ))

        XCTAssertEqual(store.currentUser?.showMe, .women)
    }

    func testShowMeMatchesExpectedGenders() {
        XCTAssertTrue(UserShowMe.men.matches(.male))
        XCTAssertFalse(UserShowMe.men.matches(.female))
        XCTAssertTrue(UserShowMe.women.matches(.female))
        XCTAssertFalse(UserShowMe.women.matches(.nonBinary))
        XCTAssertTrue(UserShowMe.everyone.matches(.other))
    }

    private func resetLocalStoreState() {
        let defaults = UserDefaults.standard
        defaults.dictionaryRepresentation().keys
            .filter { $0.hasPrefix("fyre_") }
            .forEach { defaults.removeObject(forKey: $0) }
        UserStore.shared.resetForTests()
    }

    private func registerEventEligibleUser(
        store: UserStore,
        email: String,
        gender: UserGender,
        firstName: String = "Test",
        lastName: String = "User"
    ) {
        XCTAssertNil(store.signUp(email: email, password: "password123"))
        XCTAssertNil(store.setProfileGender(gender))
        XCTAssertNil(store.updateProfile(
            firstName: firstName,
            lastName: lastName,
            birthDate: Calendar.current.date(byAdding: .year, value: -28, to: Date()),
            orientation: .straight,
            smokes: false,
            drinks: true,
            hobbies: "",
            passions: "",
            lookingFor: "",
            favoriteSong: "",
            favoriteMovie: ""
        ))
    }

    @discardableResult
    private func fillMainEventSlots(
        store: UserStore,
        count: Int,
        gender: UserGender,
        emailPrefix: String
    ) -> [String] {
        var emails: [String] = []

        for index in 0..<count {
            let email = "\(emailPrefix)-\(index)-\(UUID().uuidString.lowercased())@example.test"
            registerEventEligibleUser(
                store: store,
                email: email,
                gender: gender,
                firstName: "\(gender == .male ? "Male" : "Female") \(index)",
                lastName: "User"
            )
            XCTAssertNil(store.registerForMainEvent())
            emails.append(email)
        }

        return emails
    }
}
