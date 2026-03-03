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

    var currentUser: User?

    var isLoggedIn: Bool { currentUser != nil }

    private let key = "fyre_users"

    private init() {}

    // MARK: - Public API

    /// Register a new user. Returns an error message on failure, nil on success.
    func signUp(name: String, email: String, password: String) -> String? {
        var users = loadUsers()
        let normalizedEmail = email.lowercased().trimmingCharacters(in: .whitespaces)

        if users.contains(where: { $0.email == normalizedEmail }) {
            return "Esiste già un account con questa email."
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
        let normalizedEmail = email.lowercased().trimmingCharacters(in: .whitespaces)

        guard let user = users.first(where: { $0.email == normalizedEmail }) else {
            return "Nessun account trovato con questa email."
        }
        guard user.password == password else {
            return "Password errata."
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
        let trimmed = email.trimmingCharacters(in: .whitespaces)
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

    // MARK: - Persistence helpers - thanks ai

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

}

