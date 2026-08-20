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

    func testSessionBootstrapCompletesAndCanBeCalledAgainSafely() async {
        resetLocalStoreState()
        let store = UserStore.shared

        XCTAssertFalse(store.isSessionBootstrapComplete)

        await store.restoreRemoteSessionIfNeeded()
        XCTAssertTrue(store.isSessionBootstrapComplete)

        await store.restoreRemoteSessionIfNeeded()
        XCTAssertTrue(store.isSessionBootstrapComplete)
    }

    func testUserStoreSignUpAndLogin() async {
        resetLocalStoreState()
        let store = UserStore.shared
        let unique = UUID().uuidString.lowercased()
        let email = "\(unique)@example.test"

        let signUpError = await store.signUp(email: email, password: "password123")
        XCTAssertNil(signUpError)
        XCTAssertEqual(store.currentUser?.email, email)

        await store.logOut()
        XCTAssertNil(store.currentUser)

        let loginError = await store.logIn(email: email, password: "password123")
        XCTAssertNil(loginError)
        XCTAssertEqual(store.currentUser?.email, email)
    }

    func testResetDropsMemoryOnlyLocalAccount() async {
        resetLocalStoreState()
        let store = UserStore.shared
        let email = "\(UUID().uuidString.lowercased())@example.test"

        let signUpError = await store.signUp(email: email, password: "password123")
        XCTAssertNil(signUpError)

        store.resetForTests()

        let loginError = await store.logIn(email: email, password: "password123")
        XCTAssertEqual(loginError, L10n.tr("error.login.userNotFound"))
        XCTAssertNil(store.currentUser)
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
        let firstRegistration = await store.registerForMainEvent()
        XCTAssertNil(firstRegistration)

        await registerEventEligibleUser(store: store, email: maleBEmail, gender: .male, firstName: "Male", lastName: "B")
        let secondRegistration = await store.registerForMainEvent()
        XCTAssertNil(secondRegistration)

        let snapshot = store.mainEventSnapshot
        XCTAssertEqual(snapshot.maleCount, 2)
        XCTAssertEqual(snapshot.femaleCount, 0)
        XCTAssertEqual(snapshot.waitingListCount, 0)
        XCTAssertTrue(store.isCurrentUserRegisteredForMainEvent)
        XCTAssertFalse(store.isCurrentUserWaitingForMainEvent)
    }

    func testMockMainEventUsesExplicitLocalDeadlines() throws {
        resetLocalStoreState()
        let snapshot = UserStore.shared.mainEventSnapshot
        let registrationClosesAt = try XCTUnwrap(snapshot.registrationClosesAt)
        let cancellationClosesAt = try XCTUnwrap(snapshot.cancellationClosesAt)

        XCTAssertEqual(
            registrationClosesAt.timeIntervalSince(snapshot.date),
            -(24 * 60 * 60),
            accuracy: 0.001
        )
        XCTAssertEqual(
            cancellationClosesAt.timeIntervalSince(snapshot.date),
            -(48 * 60 * 60),
            accuracy: 0.001
        )
    }

    func testMainEventWaitlistsAfterGenderCapAndPromotesWhenSameGenderSlotOpens() async {
        resetLocalStoreState()
        let store = UserStore.shared
        let confirmedMaleEmails = await fillMainEventSlots(store: store, count: 24, gender: .male, emailPrefix: "confirmed-male")
        let waitingEmail = "\(UUID().uuidString.lowercased())@example.test"

        await registerEventEligibleUser(store: store, email: waitingEmail, gender: .male, firstName: "Waiting", lastName: "Male")
        let waitingRegistration = await store.registerForMainEvent()
        XCTAssertEqual(waitingRegistration, L10n.tr("events.success.waitlisted"))
        XCTAssertEqual(store.mainEventSnapshot.maleCount, 24)
        XCTAssertEqual(store.mainEventSnapshot.waitingListCount, 1)
        XCTAssertTrue(store.isCurrentUserWaitingForMainEvent)

        let confirmedLogin = await store.logIn(email: confirmedMaleEmails[0], password: "password123")
        XCTAssertNil(confirmedLogin)
        let cancelConfirmed = await store.cancelMainEventRegistration()
        XCTAssertNil(cancelConfirmed)

        let snapshot = store.mainEventSnapshot
        XCTAssertEqual(snapshot.maleCount, 24)
        XCTAssertEqual(snapshot.waitingListCount, 0)

        let waitingLogin = await store.logIn(email: waitingEmail, password: "password123")
        XCTAssertNil(waitingLogin)
        XCTAssertTrue(store.isCurrentUserRegisteredForMainEvent)
        XCTAssertFalse(store.isCurrentUserWaitingForMainEvent)
    }

    func testMainEventCanLeaveWaitingList() async {
        resetLocalStoreState()
        let store = UserStore.shared

        let maleBEmail = "\(UUID().uuidString.lowercased())@example.test"

        _ = await fillMainEventSlots(store: store, count: 24, gender: .male, emailPrefix: "filled-male")
        await registerEventEligibleUser(store: store, email: maleBEmail, gender: .male, firstName: "Male", lastName: "B")
        let waitlistResult = await store.registerForMainEvent()
        XCTAssertEqual(waitlistResult, L10n.tr("events.success.waitlisted"))
        XCTAssertEqual(store.mainEventSnapshot.waitingListCount, 1)
        XCTAssertTrue(store.isCurrentUserWaitingForMainEvent)

        let cancelWaiting = await store.cancelMainEventRegistration()
        XCTAssertNil(cancelWaiting)
        XCTAssertEqual(store.mainEventSnapshot.waitingListCount, 0)
        XCTAssertFalse(store.isCurrentUserWaitingForMainEvent)
    }

    func testChangingOrientationAutomaticallyCancelsEventRegistration() async {
        resetLocalStoreState()
        let store = UserStore.shared
        let email = "\(UUID().uuidString.lowercased())@example.test"

        let signUpError = await store.signUp(email: email, password: "password123")
        XCTAssertNil(signUpError)
        let setGenderError = await store.setProfileGender(.male)
        XCTAssertNil(setGenderError)
        let initialProfileError = await updateCompleteProfile(
            store: store,
            firstName: "A",
            lastName: "B",
            age: 28,
            orientation: .straight
        )
        XCTAssertNil(initialProfileError)
        let initialRegistration = await store.registerForMainEvent()
        XCTAssertNil(initialRegistration)
        XCTAssertTrue(store.isCurrentUserRegisteredForMainEvent)

        let changedOrientationError = await updateCompleteProfile(
            store: store,
            firstName: "A",
            lastName: "B",
            age: 28,
            orientation: .bisexual
        )
        XCTAssertNil(changedOrientationError)
        XCTAssertFalse(store.isCurrentUserRegisteredForMainEvent)
    }

    func testChangingGenderAutomaticallyCancelsEventRegistration() async {
        resetLocalStoreState()
        let store = UserStore.shared
        let email = "\(UUID().uuidString.lowercased())@example.test"

        let signUpError = await store.signUp(email: email, password: "password123")
        XCTAssertNil(signUpError)
        let setGenderError = await store.setProfileGender(.male)
        XCTAssertNil(setGenderError)
        let profileError = await updateCompleteProfile(
            store: store,
            firstName: "A",
            lastName: "B",
            age: 28,
            orientation: .straight
        )
        XCTAssertNil(profileError)
        let initialRegistration = await store.registerForMainEvent()
        XCTAssertNil(initialRegistration)
        XCTAssertTrue(store.isCurrentUserRegisteredForMainEvent)

        let changedGenderError = await store.setProfileGender(.other)
        XCTAssertNil(changedGenderError)
        XCTAssertFalse(store.isCurrentUserRegisteredForMainEvent)
    }

    func testMainEventRejectsNonStraightOrientation() async {
        resetLocalStoreState()
        let store = UserStore.shared
        let email = "\(UUID().uuidString.lowercased())@example.test"

        let signUpError = await store.signUp(email: email, password: "password123")
        XCTAssertNil(signUpError)
        let setGenderError = await store.setProfileGender(.female)
        XCTAssertNil(setGenderError)
        let profileError = await updateCompleteProfile(
            store: store,
            firstName: "A",
            lastName: "B",
            age: 24,
            orientation: .bisexual
        )
        XCTAssertNil(profileError)

        let error = await store.registerForMainEvent()
        XCTAssertEqual(error, L10n.tr("events.error.orientationUnsupported"))
        XCTAssertFalse(store.isCurrentUserRegisteredForMainEvent)
    }

    func testMainEventRejectsOtherGender() async {
        resetLocalStoreState()
        let store = UserStore.shared
        let email = "\(UUID().uuidString.lowercased())@example.test"

        let signUpError = await store.signUp(email: email, password: "password123")
        XCTAssertNil(signUpError)
        let setGenderError = await store.setProfileGender(.other)
        XCTAssertNil(setGenderError)
        let profileError = await updateCompleteProfile(
            store: store,
            firstName: "A",
            lastName: "B",
            age: 24,
            orientation: .straight
        )
        XCTAssertNil(profileError)

        let error = await store.registerForMainEvent()
        XCTAssertEqual(error, L10n.tr("events.error.genderUnsupported"))
        XCTAssertFalse(store.isCurrentUserRegisteredForMainEvent)
    }

    func testChangingOrientationWarnsAndRemovesConfirmedRegistration() async {
        resetLocalStoreState()
        let store = UserStore.shared
        let email = "\(UUID().uuidString.lowercased())@example.test"

        let signUpError = await store.signUp(email: email, password: "password123")
        XCTAssertNil(signUpError)
        let setGenderError = await store.setProfileGender(.male)
        XCTAssertNil(setGenderError)
        let initialProfileError = await updateCompleteProfile(
            store: store,
            firstName: "A",
            lastName: "B",
            age: 29,
            orientation: .straight
        )
        XCTAssertNil(initialProfileError)
        let initialRegistration = await store.registerForMainEvent()
        XCTAssertNil(initialRegistration)
        XCTAssertTrue(store.isCurrentUserRegisteredForMainEvent)
        XCTAssertTrue(store.willCurrentUserLoseMainEventRegistrations(orientation: .bisexual))

        let changedOrientationError = await updateCompleteProfile(
            store: store,
            firstName: "A",
            lastName: "B",
            age: 29,
            orientation: .bisexual
        )
        XCTAssertNil(changedOrientationError)

        XCTAssertFalse(store.isCurrentUserRegisteredForMainEvent)
        XCTAssertFalse(store.isCurrentUserWaitingForMainEvent)
    }

    func testChangingGenderWarnsAndRemovesWaitingListRegistration() async {
        resetLocalStoreState()
        let store = UserStore.shared
        let waitingEmail = "\(UUID().uuidString.lowercased())@example.test"

        _ = await fillMainEventSlots(store: store, count: 24, gender: .male, emailPrefix: "seeded-male")
        await registerEventEligibleUser(store: store, email: waitingEmail, gender: .male, firstName: "Second", lastName: "User")

        let waitlistResult = await store.registerForMainEvent()
        XCTAssertEqual(waitlistResult, L10n.tr("events.success.waitlisted"))
        XCTAssertTrue(store.isCurrentUserWaitingForMainEvent)
        XCTAssertTrue(store.willCurrentUserLoseMainEventRegistrations(changingGenderTo: .other))

        let changedGenderError = await store.setProfileGender(.other)
        XCTAssertNil(changedGenderError)

        XCTAssertFalse(store.isCurrentUserRegisteredForMainEvent)
        XCTAssertFalse(store.isCurrentUserWaitingForMainEvent)
    }

    func testUpdateProfilePersistsPreferredGenders() async {
        resetLocalStoreState()
        let store = UserStore.shared
        let email = "\(UUID().uuidString.lowercased())@example.test"

        let signUpError = await store.signUp(email: email, password: "password123")
        XCTAssertNil(signUpError)
        let setGenderError = await store.setProfileGender(.male)
        XCTAssertNil(setGenderError)
        let profileError = await updateCompleteProfile(
            store: store,
            firstName: "A",
            lastName: "B",
            age: 28,
            orientation: .straight,
            preferredGenders: [.female]
        )
        XCTAssertNil(profileError)

        XCTAssertEqual(store.currentUser?.resolvedPreferredGenders, [.female])
    }

    func testUpdateProfilePersistsCity() async {
        resetLocalStoreState()
        let store = UserStore.shared
        let email = "\(UUID().uuidString.lowercased())@example.test"

        let signUpError = await store.signUp(email: email, password: "password123")
        XCTAssertNil(signUpError)
        let setGenderError = await store.setProfileGender(.female)
        XCTAssertNil(setGenderError)
        let profileError = await updateCompleteProfile(
            store: store,
            firstName: "A",
            lastName: "B",
            city: "Rome",
            age: 26,
            orientation: .straight
        )
        XCTAssertNil(profileError)

        XCTAssertEqual(store.currentUser?.city, "Rome")
    }

    func testPreferredGendersKeepCanonicalOrder() {
        var user = User(email: "profile@example.test")
        user.preferredGenders = [.other, .female]

        XCTAssertEqual(user.resolvedPreferredGenders, [.female, .other])
    }

    func testProfileCompletenessRequiresExplicitCanonicalFieldsButNotCoordinates() throws {
        var user = User(email: "complete@example.test")
        user.firstName = "Ada"
        user.city = "Rome"
        user.birthDate = try XCTUnwrap(Calendar.current.date(byAdding: .year, value: -24, to: Date()))
        user.gender = .female
        user.orientation = .bisexual
        user.bio = "Profilo completo"
        user.preferredGenders = [.female, .other]

        XCTAssertNil(user.latitude)
        XCTAssertNil(user.longitude)
        XCTAssertTrue(user.isProfileComplete)

        var missingPreferences = user
        missingPreferences.preferredGenders = nil
        XCTAssertEqual(missingPreferences.resolvedPreferredGenders, UserStore.defaultPreferredGenders)
        XCTAssertFalse(missingPreferences.isProfileComplete)

        var emptyPreferences = user
        emptyPreferences.preferredGenders = []
        XCTAssertFalse(emptyPreferences.isProfileComplete)

        var missingOrientation = user
        missingOrientation.orientation = nil
        XCTAssertFalse(missingOrientation.isProfileComplete)

        var underage = user
        underage.birthDate = try XCTUnwrap(Calendar.current.date(byAdding: .year, value: -17, to: Date()))
        XCTAssertFalse(underage.isProfileComplete)
    }

    func testDiscoveryPreferencesStayInsideCanonicalBounds() {
        var user = User(email: "filters@example.test")
        user.minPreferredAge = 99
        user.maxPreferredAge = 18
        user.maxDistanceKm = 10_000

        XCTAssertEqual(user.resolvedMinPreferredAge, 98)
        XCTAssertEqual(user.resolvedMaxPreferredAge, 99)
        XCTAssertEqual(user.normalizedMaxDistanceKm, 999)

        user.minPreferredAge = 1
        user.maxPreferredAge = 200
        user.maxDistanceKm = 1

        XCTAssertEqual(user.resolvedMinPreferredAge, 18)
        XCTAssertEqual(user.resolvedMaxPreferredAge, 99)
        XCTAssertEqual(user.normalizedMaxDistanceKm, 5)

        user.maxDistanceKm = nil
        XCTAssertNil(user.normalizedMaxDistanceKm)
        XCTAssertNil(UserIntent(rawValue: "networking"))
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
        let signUpError = await store.signUp(email: email, password: "password123")
        XCTAssertNil(signUpError)
        let setGenderError = await store.setProfileGender(gender)
        XCTAssertNil(setGenderError)
        let profileError = await updateCompleteProfile(
            store: store,
            firstName: firstName,
            lastName: lastName,
            age: 28,
            orientation: .straight
        )
        XCTAssertNil(profileError)
    }

    private func updateCompleteProfile(
        store: UserStore,
        firstName: String,
        lastName: String,
        city: String = "Rome",
        age: Int,
        orientation: UserOrientation,
        preferredGenders: [UserGender] = UserStore.defaultPreferredGenders
    ) async -> String? {
        await store.updateProfile(
            firstName: firstName,
            lastName: lastName,
            city: city,
            birthDate: Calendar.current.date(byAdding: .year, value: -age, to: Date()),
            orientation: orientation,
            bio: "Profilo di test completo",
            intent: .relationship,
            interests: "Musica",
            instagramTag: "",
            spotifyTag: "",
            preferredGenders: preferredGenders,
            minPreferredAge: 18,
            maxPreferredAge: 35,
            maxDistanceKm: 50,
            excludeSmokers: false,
            excludeDrinkers: false,
            smokes: false,
            drinks: true
        )
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
            let registrationError = await store.registerForMainEvent()
            XCTAssertNil(registrationError)
            emails.append(email)
        }

        return emails
    }
}
