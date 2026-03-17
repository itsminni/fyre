//
//  UserStore.swift
//  Fyre
//
//  Created by Gabriele Mininni on 03/03/26.
//  Local user store for demo purposes (UserDefaults-backed).
//

import Foundation
import Observation

struct User: Codable, Sendable {
    let name: String
    let email: String
    let password: String
}

@Observable
final class UserStore: @unchecked Sendable {
    static let shared = UserStore()

    var currentUser: User? {
        didSet {
            saveCurrentUser(currentUser)
        }
    }

    var isLoggedIn: Bool { currentUser != nil }

    private let key = "fyre_users"
    private let currentUserKey = "fyre_current_user"

    private init() {
        currentUser = loadCurrentUser()
    }

    // MARK: - Public API

    /// Register a new user. Returns an error message on failure, nil on success.
    func signUp(name: String, email: String, password: String) -> String? {
        var users = loadUsers()
        let normalizedEmail = normalizeEmail(email)

        if users.contains(where: { $0.email == normalizedEmail }) {
            return L10n.tr("error.signup.emailInUse")
        }

        let user = User(name: name, email: normalizedEmail, password: password)
        users.append(user)
        saveUsers(users)
        currentUser = user
        return nil
    }

    /// Log in with email + password. Returns an error message on failure, nil on success.
    func logIn(email: String, password: String) -> String? {
        let users = loadUsers()
        let normalizedEmail = normalizeEmail(email)

        guard let user = users.first(where: { $0.email == normalizedEmail }) else {
            return L10n.tr("error.login.userNotFound")
        }
        guard user.password == password else {
            return L10n.tr("error.login.invalidPassword")
        }

        currentUser = user
        return nil
    }

    func logOut() {
        currentUser = nil
    }

    // MARK: - Email validation

    /// Checks that the email has a reasonable format: local@domain.tld
    static func isValidEmail(_ email: String) -> Bool {
        let trimmed = email.trimmingCharacters(in: .whitespacesAndNewlines)
        // Must have exactly one @, non-empty local part, domain with at least one dot
        let parts = trimmed.split(separator: "@", omittingEmptySubsequences: false)
        guard parts.count == 2 else { return false }
        let local = parts[0]
        let domain = parts[1]
        guard !local.isEmpty, domain.contains(".") else { return false }
        let domainParts = domain.split(separator: ".", omittingEmptySubsequences: false)
        // domain needs at least two non-empty segments (e.g. gmail.com)
        guard domainParts.count >= 2, domainParts.allSatisfy({ !$0.isEmpty }) else { return false }
        // TLD at least 2 chars
        guard let tld = domainParts.last, tld.count >= 2 else { return false }
        return true
    }

    // MARK: - Persistence helpers

    private func normalizeEmail(_ email: String) -> String {
        email.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func loadUsers() -> [User] {
        guard let data = UserDefaults.standard.data(forKey: key),
              let users = try? JSONDecoder().decode([User].self, from: data) else {
            return []
        }
        return users
    }

    private func saveUsers(_ users: [User]) {
        if let data = try? JSONEncoder().encode(users) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }

    private func loadCurrentUser() -> User? {
        guard let data = UserDefaults.standard.data(forKey: currentUserKey),
              let user = try? JSONDecoder().decode(User.self, from: data) else {
            return nil
        }
        return user
    }

    private func saveCurrentUser(_ user: User?) {
        guard let user else {
            UserDefaults.standard.removeObject(forKey: currentUserKey)
            return
        }

        if let data = try? JSONEncoder().encode(user) {
            UserDefaults.standard.set(data, forKey: currentUserKey)
        }
    }

}
