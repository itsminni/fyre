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
    @State private var errorMessage: String?

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

#Preview {
    NavigationStack { LoginView() }
        .environment(UserStore.shared)
}
