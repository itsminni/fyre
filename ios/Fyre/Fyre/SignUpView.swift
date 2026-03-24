//
//  SignUpView.swift
//  Fyre
//
//  Created by Gabriele Mininni on 11/02/26.
//

import SwiftUI

// Sign-up screen
// - Collects name, email and password for account creation
// - Includes a terms toggle and basic client validation
// - Accessibility identifiers are present for UI tests

struct SignUpView: View {
    @Environment(UserStore.self) private var store
    @State private var email = ""
    @State private var password = ""
    @State private var isSecure = true
    @State private var agree = false
    @State private var errorMessage: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                // Header: sign-up title
                Text(L10n.tr("auth.signup.title"))
                    .font(.system(size: 32, weight: .bold, design: .rounded))
                    .padding(.top, 8)
                    .accessibilityAddTraits(.isHeader)

                VStack(spacing: 16) {
                    // Email input
                    TextField(L10n.tr("field.email"), text: $email)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .accessibilityIdentifier("signup.email")

                    ZStack(alignment: .trailing) {
                        // Password input with optional reveal
                        if isSecure {
                            SecureField(L10n.tr("field.password"), text: $password)
                                .textContentType(.newPassword)
                                .accessibilityIdentifier("signup.password.secure")
                        } else {
                            TextField(L10n.tr("field.password"), text: $password)
                                .textContentType(.newPassword)
                                .accessibilityIdentifier("signup.password.plain")
                        }

                        Button {
                            isSecure.toggle()
                        } label: {
                            Image(systemName: isSecure ? "eye" : "eye.slash")
                                .foregroundStyle(.secondary)
                        }
                        .buttonStyle(.plain)
                    }

                    // Terms acceptance toggle (required to enable sign-up)
                    Toggle(isOn: $agree) {
                        Text(L10n.tr("auth.signup.terms"))
                    }
                    .toggleStyle(.switch)
                    .font(.footnote)
                    .accessibilityIdentifier("signup.terms")

                    // Show validation or server-side errors
                    if let errorMessage {
                        Text(errorMessage)
                            .font(.footnote)
                            .foregroundStyle(.red)
                    }

                    // Primary create-account action
                    Button {
                        errorMessage = nil
                        if let err = store.signUp(email: email, password: password) {
                            errorMessage = err
                        }
                    } label: {
                        Text(L10n.tr("auth.signup.action"))
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.pink)
                    .controlSize(.large)
                    .disabled(!isFormValid)
                    .opacity(isFormValid ? 1 : 0.6)
                    .accessibilityIdentifier("signup.submit")

                    // Link back to login for existing users
                    HStack(spacing: 6) {
                        Text(L10n.tr("auth.haveAccount.prompt"))
                            .foregroundStyle(.secondary)
                        NavigationLink(L10n.tr("auth.login.action"), destination: LoginView())
                            .accessibilityIdentifier("signup.gotoLogin")
                    }
                    .font(.footnote)
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
        .navigationTitle(L10n.tr("auth.signup.navigationTitle"))
        .navigationBarTitleDisplayMode(.inline)
    }

    private var isFormValid: Bool {
        UserStore.isValidEmail(email) &&
        password.count >= 6 &&
        agree
    }
}

#Preview {
    NavigationStack { SignUpView() }
        .environment(UserStore.shared)
}
