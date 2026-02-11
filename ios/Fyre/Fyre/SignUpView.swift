//
//  SignUpView.swift
//  Fyre
//
//  Created by Gabriele Mininni on 11/02/26.
//

import SwiftUI

struct SignUpView: View {
    @State private var name: String = ""
    @State private var email: String = ""
    @State private var password: String = ""
    @State private var isSecure: Bool = true
    @State private var agree: Bool = false

    var body: some View {
        FormContainer(title: "Crea account") {
            VStack(spacing: 16) {
                TextField("Nome", text: $name)
                    .textContentType(.name)

                TextField("Email", text: $email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .autocapitalization(.none)
                    .textInputAutocapitalization(.never)

                Group {
                    if isSecure {
                        SecureField("Password", text: $password)
                            .textContentType(.newPassword)
                    } else {
                        TextField("Password", text: $password)
                            .textContentType(.newPassword)
                    }
                }
                .overlay(alignment: .trailing) {
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

                Button {
                    // TODO: Handle sign up action
                } label: {
                    Text("Crea account")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(.pink)
                .controlSize(.large)
                .disabled(!isFormValid)
                .opacity(isFormValid ? 1 : 0.6)
            }
        }
        .navigationTitle("Sign up")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var isFormValid: Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        email.contains("@") &&
        password.count >= 6 &&
        agree
    }
}

#Preview {
    NavigationStack { SignUpView() }
}
