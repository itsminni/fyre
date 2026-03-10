//
//  LoginView.swift
//  Fyre
//
//  Created by Gabriele Mininni on 11/02/26.
//

import SwiftUI
import AuthenticationServices
import UIKit

struct LoginView: View {
    @Environment(UserStore.self) private var store
    @State private var email = ""
    @State private var password = ""
    @State private var isSecure = true
    @State private var errorMessage: String?
    @State private var passwordSignInCoordinator: PasswordSignInCoordinator?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Text("Accedi")
                    .font(.system(size: 32, weight: .bold, design: .rounded))
                    .padding(.top, 8)

                VStack(spacing: 16) {
                    TextField("Email", text: $email)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()

                    ZStack(alignment: .trailing) {
                        if isSecure {
                            SecureField("Password", text: $password)
                                .textContentType(.password)
                        } else {
                            TextField("Password", text: $password)
                                .textContentType(.password)
                        }

                        Button {
                            isSecure.toggle()
                        } label: {
                            Image(systemName: isSecure ? "eye" : "eye.slash")
                                .foregroundStyle(.secondary)
                        }
                        .buttonStyle(.plain)
                    }

                    if let errorMessage {
                        Text(errorMessage)
                            .font(.footnote)
                            .foregroundStyle(.red)
                    }

                    Button {
                        errorMessage = nil
                        if let err = store.logIn(email: email, password: password) {
                            errorMessage = err
                        }
                    } label: {
                        Text("Accedi")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.pink)
                    .controlSize(.large)
                    .disabled(!isFormValid)
                    .opacity(isFormValid ? 1 : 0.6)
                    .padding(.top, 8)

                    Button {
                        errorMessage = nil
                        let coordinator = PasswordSignInCoordinator(
                            onCredential: { username, credentialPassword in
                                email = username
                                password = credentialPassword
                                if let err = store.logIn(email: username, password: credentialPassword) {
                                    errorMessage = err
                                }
                            },
                            onError: { message in
                                errorMessage = message
                            }
                        )
                        passwordSignInCoordinator = coordinator
                        coordinator.start()
                    } label: {
                        Label("Usa password iCloud", systemImage: "key.fill")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.large)

                    HStack(spacing: 6) {
                        Text("Non hai un account?")
                            .foregroundStyle(.secondary)
                        NavigationLink("Registrati", destination: SignUpView())
                    }
                    .font(.footnote)
                    .padding(.top, 4)
                }
                .padding(16)
                .background(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .fill(Color(.secondarySystemBackground))
                )
            }
            .padding(20)
        }
        .background(Color(.systemBackground))
        .navigationTitle("Log in")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var isFormValid: Bool {
        UserStore.isValidEmail(email) && password.count >= 6
    }
}

private final class PasswordSignInCoordinator: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    private let onCredential: (String, String) -> Void
    private let onError: (String) -> Void

    init(
        onCredential: @escaping (String, String) -> Void,
        onError: @escaping (String) -> Void
    ) {
        self.onCredential = onCredential
        self.onError = onError
    }

    func start() {
        let request = ASAuthorizationPasswordProvider().createRequest()
        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        controller.performRequests()
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        guard
            let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
            let window = scene.windows.first(where: { $0.isKeyWindow }) ?? scene.windows.first
        else {
            return ASPresentationAnchor()
        }
        return window
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let credential = authorization.credential as? ASPasswordCredential else {
            onError("Nessuna credenziale iCloud disponibile.")
            return
        }
        onCredential(credential.user, credential.password)
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        if let authError = error as? ASAuthorizationError, authError.code == .canceled {
            return
        }
        onError("Accesso iCloud non riuscito. Riprova.")
    }
}

#Preview {
    NavigationStack { LoginView() }
        .environment(UserStore.shared)
}
