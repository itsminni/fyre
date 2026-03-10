//
//  AuthService.swift
//  Fyre
//
//  Created by Gabriele Mininni on 10/03/26.
//

import Foundation

enum AuthServiceError: Error, Sendable {
    case emailAlreadyInUse
    case userNotFound
    case invalidPassword
}

protocol AuthService: Sendable {
    func signUp(name: String, email: String, password: String) -> Result<User, AuthServiceError>
    func logIn(email: String, password: String) -> Result<User, AuthServiceError>
    func logOut()
}
