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
    @State private var isTermsPrivacyPresented = false
    @State private var isSubmitting = false
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
                                .textContentType(.password)
                                .accessibilityIdentifier("signup.password.secure")
                        } else {
                            TextField(L10n.tr("field.password"), text: $password)
                                .textContentType(.password)
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

                    // Terms acceptance toggle and full-screen terms/privacy disclosure
                    HStack(alignment: .center, spacing: 12) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(L10n.tr("auth.signup.terms.prefix"))
                                .font(.footnote)

                            Button {
                                isTermsPrivacyPresented = true
                            } label: {
                                Text(L10n.tr("auth.signup.terms.link"))
                                    .font(.footnote.weight(.semibold))
                                    .underline()
                            }
                            .buttonStyle(.plain)
                            .foregroundStyle(.blue)
                            .accessibilityIdentifier("signup.terms.link")
                        }

                        Spacer(minLength: 12)

                        Toggle("", isOn: $agree)
                            .labelsHidden()
                            .toggleStyle(.switch)
                            .accessibilityIdentifier("signup.terms")
                    }

                    // Show validation or server-side errors
                    if let errorMessage {
                        Text(errorMessage)
                            .font(.footnote)
                            .foregroundStyle(.red)
                    }

                    // Primary create-account action
                    Button {
                        Task {
                            await submitSignUp()
                        }
                    } label: {
                        Group {
                            if isSubmitting {
                                ProgressView()
                                    .frame(maxWidth: .infinity)
                            } else {
                                Text(L10n.tr("auth.signup.action"))
                                    .frame(maxWidth: .infinity)
                            }
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.pink)
                    .controlSize(.large)
                    .disabled(!isFormValid || isSubmitting)
                    .opacity((isFormValid && !isSubmitting) ? 1 : 0.6)
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
        .fullScreenCover(isPresented: $isTermsPrivacyPresented) {
            TermsPrivacyView()
        }
    }

    private var isFormValid: Bool {
        UserStore.isValidEmail(email) &&
        password.count >= 8 &&
        agree
    }

    @MainActor
    private func submitSignUp() async {
        guard !isSubmitting else { return }
        isSubmitting = true
        errorMessage = nil
        // UserStore owns the real Appwrite/signup flow and the local fallback used by tests.
        let result = await store.signUp(email: email, password: password)
        errorMessage = result
        isSubmitting = false
    }
}

private struct TermsPrivacyView: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text(L10n.tr("auth.signup.privacy.title"))
                        .font(.title2.weight(.bold))

                    Text(L10n.tr("auth.signup.privacy.body"))
                        .font(.body)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(20)
            }
            .background(Color(.systemBackground))
            .navigationTitle(L10n.tr("auth.signup.privacy.navigationTitle"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(L10n.tr("common.done")) {
                        dismiss()
                    }
                }
            }
        }
    }
}

#Preview {
    NavigationStack { SignUpView() }
        .environment(UserStore.shared)
}
