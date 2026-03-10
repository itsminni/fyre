//
//  LocalAuthService.swift
//  Fyre
//
//  Created by Gabriele Mininni on 10/03/26.
//

import Foundation

/// Local implementation backed by UserDefaults. This is a temporary data source
/// that can later be replaced by a remote API-based service. (made by ai, it is a local draft)
final class LocalAuthService: AuthService, @unchecked Sendable {
    private let key = "fyre_users"

    func signUp(name: String, email: String, password: String) -> Result<User, AuthServiceError> {
        var users = loadUsers()
        let normalizedEmail = normalizeEmail(email)

        if users.contains(where: { $0.email == normalizedEmail }) {
            return .failure(.emailAlreadyInUse)
        }

        let user = User(name: name, email: normalizedEmail, password: password)
        users.append(user)
        saveUsers(users)
        return .success(user)
    }

    func logIn(email: String, password: String) -> Result<User, AuthServiceError> {
        let users = loadUsers()
        let normalizedEmail = normalizeEmail(email)

        guard let user = users.first(where: { $0.email == normalizedEmail }) else {
            return .failure(.userNotFound)
        }
        guard user.password == password else {
            return .failure(.invalidPassword)
        }

        return .success(user)
    }

    func logOut() {
        // No local side effects needed for now.
    }

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
}
