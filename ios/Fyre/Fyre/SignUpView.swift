//
//  SignUpView.swift
//  Fyre
//
//  Created by Gabriele Mininni on 11/02/26.
//

import SwiftUI

struct SignUpView: View {
    @Environment(UserStore.self) private var store
    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var isSecure = true
    @State private var agree = false
    @State private var errorMessage: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Text("Crea account")
                    .font(.system(size: 32, weight: .bold, design: .rounded))
                    .padding(.top, 8)

                VStack(spacing: 16) {
                    TextField("Nome", text: $name)
                        .textContentType(.name)

                    TextField("Email", text: $email)
                        .textContentType(.username)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()

                    ZStack(alignment: .trailing) {
                        if isSecure {
                            SecureField("Password", text: $password)
                                .textContentType(.newPassword)
                        } else {
                            TextField("Password", text: $password)
                                .textContentType(.newPassword)
                        }

                        Button {
                            isSecure.toggle()
                        } label: {
                            Image(systemName: isSecure ? "eye" : "eye.slash")
                                .foregroundStyle(.secondary)
                        }
                        .buttonStyle(.plain)
                    }

                    Toggle(isOn: $agree) {
                        Text("Accetto i Termini e l'Informativa sulla privacy")
                    }
                    .toggleStyle(.switch)
                    .font(.footnote)

                    if let errorMessage {
                        Text(errorMessage)
                            .font(.footnote)
                            .foregroundStyle(.red)
                    }

                    Button {
                        errorMessage = nil
                        if let err = store.signUp(name: name, email: email, password: password) {
                            errorMessage = err
                        }
                    } label: {
                        Text("Crea account")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.pink)
                    .controlSize(.large)
                    .disabled(!isFormValid)
                    .opacity(isFormValid ? 1 : 0.6)

                    HStack(spacing: 6) {
                        Text("Hai già un account?")
                            .foregroundStyle(.secondary)
                        NavigationLink("Accedi", destination: LoginView())
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
        .navigationTitle("Sign up")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var isFormValid: Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        UserStore.isValidEmail(email) &&
        password.count >= 6 &&
        agree
    }
}

#Preview {
    NavigationStack { SignUpView() }
        .environment(UserStore.shared)
}
