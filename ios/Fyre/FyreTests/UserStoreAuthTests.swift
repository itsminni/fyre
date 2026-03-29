//
//  UserStoreAuthTests.swift
//  Fyre
//
//  Created by Gabriele Mininni on 17/03/26.
//

import XCTest
@testable import Fyre

@MainActor
final class UserStoreAuthTests: XCTestCase {
    // These tests exercise the deterministic local fallback path instead of hitting Appwrite.
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

    func testUserStoreSignUpAndLogin() async {
        resetLocalStoreState()
        let store = UserStore.shared
        let unique = UUID().uuidString.lowercased()
        let email = "\(unique)@example.test"

        XCTAssertNil(await store.signUp(email: email, password: "password123"))
        XCTAssertEqual(store.currentUser?.email, email)

        await store.logOut()
        XCTAssertNil(store.currentUser)

        XCTAssertNil(await store.logIn(email: email, password: "password123"))
        XCTAssertEqual(store.currentUser?.email, email)
    }

    func testSignUpRejectsEmailsWithSpaces() async {
        resetLocalStoreState()
        let store = UserStore.shared

        let error = await store.signUp(email: "name surname@example.com", password: "password123")
        XCTAssertEqual(error, L10n.tr("error.auth.invalidEmail"))
        XCTAssertNil(store.currentUser)
    }

    func testMainEventAllowsSameGenderRegistrationsBeforeGenderCap() async {
        resetLocalStoreState()
        let store = UserStore.shared

        let maleAEmail = "\(UUID().uuidString.lowercased())@example.test"
        let maleBEmail = "\(UUID().uuidString.lowercased())@example.test"

        await registerEventEligibleUser(store: store, email: maleAEmail, gender: .male, firstName: "Male", lastName: "A")
        XCTAssertNil(store.registerForMainEvent())

        await registerEventEligibleUser(store: store, email: maleBEmail, gender: .male, firstName: "Male", lastName: "B")
        XCTAssertNil(store.registerForMainEvent())

        let snapshot = store.mainEventSnapshot
        XCTAssertEqual(snapshot.maleCount, 2)
        XCTAssertEqual(snapshot.femaleCount, 0)
        XCTAssertEqual(snapshot.waitingListCount, 0)
        XCTAssertTrue(store.isCurrentUserRegisteredForMainEvent)
        XCTAssertFalse(store.isCurrentUserWaitingForMainEvent)
    }

    func testMainEventWaitlistsAfterGenderCapAndPromotesWhenSameGenderSlotOpens() async {
        resetLocalStoreState()
        let store = UserStore.shared
        let confirmedMaleEmails = await fillMainEventSlots(store: store, count: 24, gender: .male, emailPrefix: "confirmed-male")
        let waitingEmail = "\(UUID().uuidString.lowercased())@example.test"

        await registerEventEligibleUser(store: store, email: waitingEmail, gender: .male, firstName: "Waiting", lastName: "Male")
        XCTAssertEqual(store.registerForMainEvent(), L10n.tr("events.success.waitlisted"))
        XCTAssertEqual(store.mainEventSnapshot.maleCount, 24)
        XCTAssertEqual(store.mainEventSnapshot.waitingListCount, 1)
        XCTAssertTrue(store.isCurrentUserWaitingForMainEvent)

        XCTAssertNil(await store.logIn(email: confirmedMaleEmails[0], password: "password123"))
        XCTAssertNil(store.cancelMainEventRegistration())

        let snapshot = store.mainEventSnapshot
        XCTAssertEqual(snapshot.maleCount, 24)
        XCTAssertEqual(snapshot.waitingListCount, 0)

        XCTAssertNil(await store.logIn(email: waitingEmail, password: "password123"))
        XCTAssertTrue(store.isCurrentUserRegisteredForMainEvent)
        XCTAssertFalse(store.isCurrentUserWaitingForMainEvent)
    }

    func testMainEventCanLeaveWaitingList() async {
        resetLocalStoreState()
        let store = UserStore.shared

        let maleBEmail = "\(UUID().uuidString.lowercased())@example.test"

        _ = await fillMainEventSlots(store: store, count: 24, gender: .male, emailPrefix: "filled-male")
        await registerEventEligibleUser(store: store, email: maleBEmail, gender: .male, firstName: "Male", lastName: "B")
        XCTAssertEqual(store.registerForMainEvent(), L10n.tr("events.success.waitlisted"))
        XCTAssertEqual(store.mainEventSnapshot.waitingListCount, 1)
        XCTAssertTrue(store.isCurrentUserWaitingForMainEvent)

        XCTAssertNil(store.cancelMainEventRegistration())
        XCTAssertEqual(store.mainEventSnapshot.waitingListCount, 0)
        XCTAssertFalse(store.isCurrentUserWaitingForMainEvent)
    }

    func testChangingOrientationAutomaticallyCancelsEventRegistration() async {
        resetLocalStoreState()
        let store = UserStore.shared
        let email = "\(UUID().uuidString.lowercased())@example.test"

        XCTAssertNil(await store.signUp(email: email, password: "password123"))
        XCTAssertNil(await store.setProfileGender(.male))
        XCTAssertNil(await store.updateProfile(
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

        XCTAssertNil(await store.updateProfile(
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

    func testChangingGenderAutomaticallyCancelsEventRegistration() async {
        resetLocalStoreState()
        let store = UserStore.shared
        let email = "\(UUID().uuidString.lowercased())@example.test"

        XCTAssertNil(await store.signUp(email: email, password: "password123"))
        XCTAssertNil(await store.setProfileGender(.male))
        XCTAssertNil(await store.updateProfile(
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

        XCTAssertNil(await store.setProfileGender(.other))
        XCTAssertFalse(store.isCurrentUserRegisteredForMainEvent)
    }

    func testMainEventRejectsNonStraightOrientation() async {
        resetLocalStoreState()
        let store = UserStore.shared
        let email = "\(UUID().uuidString.lowercased())@example.test"

        XCTAssertNil(await store.signUp(email: email, password: "password123"))
        XCTAssertNil(await store.setProfileGender(.female))
        XCTAssertNil(await store.updateProfile(
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

    func testMainEventRejectsOtherGender() async {
        resetLocalStoreState()
        let store = UserStore.shared
        let email = "\(UUID().uuidString.lowercased())@example.test"

        XCTAssertNil(await store.signUp(email: email, password: "password123"))
        XCTAssertNil(await store.setProfileGender(.other))
        XCTAssertNil(await store.updateProfile(
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

    func testChangingOrientationWarnsAndRemovesConfirmedRegistration() async {
        resetLocalStoreState()
        let store = UserStore.shared
        let email = "\(UUID().uuidString.lowercased())@example.test"

        XCTAssertNil(await store.signUp(email: email, password: "password123"))
        XCTAssertNil(await store.setProfileGender(.male))
        XCTAssertNil(await store.updateProfile(
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

        XCTAssertNil(await store.updateProfile(
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

    func testChangingGenderWarnsAndRemovesWaitingListRegistration() async {
        resetLocalStoreState()
        let store = UserStore.shared
        let waitingEmail = "\(UUID().uuidString.lowercased())@example.test"

        _ = await fillMainEventSlots(store: store, count: 24, gender: .male, emailPrefix: "seeded-male")
        await registerEventEligibleUser(store: store, email: waitingEmail, gender: .male, firstName: "Second", lastName: "User")

        XCTAssertEqual(store.registerForMainEvent(), L10n.tr("events.success.waitlisted"))
        XCTAssertTrue(store.isCurrentUserWaitingForMainEvent)
        XCTAssertTrue(store.willCurrentUserLoseMainEventRegistrations(changingGenderTo: .other))

        XCTAssertNil(await store.setProfileGender(.other))

        XCTAssertFalse(store.isCurrentUserRegisteredForMainEvent)
        XCTAssertFalse(store.isCurrentUserWaitingForMainEvent)
    }

    func testUpdateProfilePersistsShowMePreference() async {
        resetLocalStoreState()
        let store = UserStore.shared
        let email = "\(UUID().uuidString.lowercased())@example.test"

        XCTAssertNil(await store.signUp(email: email, password: "password123"))
        XCTAssertNil(await store.setProfileGender(.male))
        XCTAssertNil(await store.updateProfile(
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

    func testUpdateProfilePersistsCity() async {
        resetLocalStoreState()
        let store = UserStore.shared
        let email = "\(UUID().uuidString.lowercased())@example.test"

        XCTAssertNil(await store.signUp(email: email, password: "password123"))
        XCTAssertNil(await store.setProfileGender(.female))
        XCTAssertNil(await store.updateProfile(
            firstName: "A",
            lastName: "B",
            city: "Rome",
            birthDate: Calendar.current.date(byAdding: .year, value: -26, to: Date()),
            orientation: .straight,
            smokes: false,
            drinks: true,
            hobbies: "",
            passions: "",
            lookingFor: "",
            favoriteSong: "",
            favoriteMovie: ""
        ))

        XCTAssertEqual(store.currentUser?.city, "Rome")
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
    ) async {
        XCTAssertNil(await store.signUp(email: email, password: "password123"))
        XCTAssertNil(await store.setProfileGender(gender))
        XCTAssertNil(await store.updateProfile(
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
    ) async -> [String] {
        var emails: [String] = []

        for index in 0..<count {
            let email = "\(emailPrefix)-\(index)-\(UUID().uuidString.lowercased())@example.test"
            await registerEventEligibleUser(
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
