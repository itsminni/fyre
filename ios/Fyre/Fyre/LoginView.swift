//
//  LoginView.swift
//  Fyre
//
//  Created by Gabriele Mininni on 11/02/26.
//

import SwiftUI

struct LoginView: View {
    @Environment(UserStore.self) private var store
    @State private var email = ""
    @State private var password = ""
    @State private var isSecure = true
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Text(L10n.tr("auth.login.title"))
                    .font(.system(size: 32, weight: .bold, design: .rounded))
                    .padding(.top, 8)
                    .accessibilityAddTraits(.isHeader)

                VStack(spacing: 16) {
                    TextField(L10n.tr("field.email"), text: $email)
                        .textContentType(.username)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .accessibilityIdentifier("login.email")

                    ZStack(alignment: .trailing) {
                        if isSecure {
                            SecureField(L10n.tr("field.password"), text: $password)
                                .textContentType(.password)
                                .accessibilityIdentifier("login.password.secure")
                        } else {
                            TextField(L10n.tr("field.password"), text: $password)
                                .textContentType(.password)
                                .accessibilityIdentifier("login.password.plain")
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
                        Task {
                            await submitLogin()
                        }
                    } label: {
                        Group {
                            if isSubmitting {
                                ProgressView()
                                    .frame(maxWidth: .infinity)
                            } else {
                                Text(L10n.tr("auth.login.action"))
                                    .frame(maxWidth: .infinity)
                            }
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.pink)
                    .controlSize(.large)
                    .disabled(!isFormValid || isSubmitting)
                    .opacity((isFormValid && !isSubmitting) ? 1 : 0.6)
                    .padding(.top, 8)
                    .accessibilityIdentifier("login.submit")

                    HStack(spacing: 6) {
                        Text(L10n.tr("auth.noAccount.prompt"))
                            .foregroundStyle(.secondary)
                        NavigationLink(L10n.tr("auth.signup.action"), destination: SignUpView())
                            .accessibilityIdentifier("login.gotoSignup")
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
        .navigationTitle(L10n.tr("auth.login.navigationTitle"))
        .navigationBarTitleDisplayMode(.inline)
    }

    private var isFormValid: Bool {
        UserStore.isValidEmail(email) && password.count >= 8
    }

    @MainActor
    private func submitLogin() async {
        guard !isSubmitting else { return }
        isSubmitting = true
        errorMessage = nil
        // Keep auth side effects inside UserStore so the view only manages transient UI state.
        let result = await store.logIn(email: email, password: password)
        errorMessage = result
        isSubmitting = false
    }
}

#Preview {
    NavigationStack { LoginView() }
        .environment(UserStore.shared)
}
