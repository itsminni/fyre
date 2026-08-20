//
//  SignUpView.swift
//  Fyre
//
//  Created by Gabriele Mininni on 11/02/26.
//

import SwiftUI

struct SignUpView: View {
    @Environment(UserStore.self) private var store
    @State private var email = ""
    @State private var password = ""
    @State private var isSecure = true
    @State private var hasReadDemoNotice = false
    @State private var isDemoNoticePresented = false
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Text(L10n.tr("auth.signup.title"))
                    .font(.system(size: 32, weight: .bold, design: .rounded))
                    .padding(.top, 8)
                    .accessibilityAddTraits(.isHeader)

                VStack(spacing: 16) {
                    TextField(L10n.tr("field.email"), text: $email)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .accessibilityIdentifier("signup.email")

                    ZStack(alignment: .trailing) {
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

                    HStack(alignment: .center, spacing: 12) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(L10n.tr("auth.signup.demoNotice.prefix"))
                                .font(.footnote)

                            Button {
                                isDemoNoticePresented = true
                            } label: {
                                Text(L10n.tr("auth.signup.demoNotice.link"))
                                    .font(.footnote.weight(.semibold))
                                    .underline()
                            }
                            .buttonStyle(.plain)
                            .foregroundStyle(.blue)
                            .accessibilityIdentifier("signup.demoNotice.link")
                        }

                        Spacer(minLength: 12)

                        Toggle("", isOn: $hasReadDemoNotice)
                            .labelsHidden()
                            .toggleStyle(.switch)
                            .accessibilityLabel(L10n.tr("auth.signup.demoNotice.link"))
                            .accessibilityIdentifier("signup.demoNotice")
                    }

                    if let errorMessage {
                        Text(errorMessage)
                            .font(.footnote)
                            .foregroundStyle(.red)
                    }

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
        .fullScreenCover(isPresented: $isDemoNoticePresented) {
            DemoNoticeView()
        }
    }

    private var isFormValid: Bool {
        UserStore.isValidEmail(email) &&
        password.count >= 8 &&
        hasReadDemoNotice
    }

    @MainActor
    private func submitSignUp() async {
        guard !isSubmitting else { return }
        isSubmitting = true
        errorMessage = nil
        let result = await store.signUp(email: email, password: password)
        errorMessage = result
        isSubmitting = false
    }
}

private struct DemoNoticeView: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text(L10n.tr("auth.signup.demoNotice.title"))
                        .font(.title2.weight(.bold))

                    Text(L10n.tr("auth.signup.demoNotice.body"))
                        .font(.body)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(20)
            }
            .background(Color(.systemBackground))
            .navigationTitle(L10n.tr("auth.signup.demoNotice.navigationTitle"))
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
