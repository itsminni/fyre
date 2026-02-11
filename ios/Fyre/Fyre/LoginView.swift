//
//  LoginView.swift
//  Fyre
//
//  Created by Gabriele Mininni on 11/02/26.
//

import SwiftUI

struct LoginView: View {
    @State private var email: String = ""
    @State private var password: String = ""
    @State private var isSecure: Bool = true

    var body: some View {
        FormContainer(title: "Accedi") {
            VStack(spacing: 16) {
                // Email
                TextField("Email", text: $email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .autocapitalization(.none)
                    .textInputAutocapitalization(.never)
                    .submitLabel(.next)

                // Password
                Group {
                    if isSecure {
                        SecureField("Password", text: $password)
                            .textContentType(.password)
                            .submitLabel(.go)
                    } else {
                        TextField("Password", text: $password)
                            .textContentType(.password)
                            .submitLabel(.go)
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

                // Primary action
                Button {
                    // TODO: Handle login action
                } label: {
                    Text("Log in")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(.pink)
                .controlSize(.large)
                .padding(.top, 8)

                // Secondary text
                HStack(spacing: 6) {
                    Text("Non hai un account?")
                        .foregroundStyle(.secondary)
                    NavigationLink("Registrati", destination: SignUpView())
                }
                .font(.footnote)
                .padding(.top, 4)
            }
        }
        .toolbarTitleDisplayMode()
    }
}

private extension View {
    func toolbarTitleDisplayMode() -> some View {
        self
            .navigationTitle("Log in")
            .navigationBarTitleDisplayMode(.inline)
    }
}

// Shared minimalist container used across auth screens
struct FormContainer<Content: View>: View {
    let title: String
    @ViewBuilder var content: () -> Content

    init(title: String, @ViewBuilder content: @escaping () -> Content) {
        self.title = title
        self.content = content
    }

    var body: some View {
        ZStack {
            LinearGradient(colors: [Color(.systemBackground), Color(.secondarySystemBackground)], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    Text(title)
                        .font(.system(size: 32, weight: .bold, design: .rounded))
                        .padding(.top, 8)

                    VStack(spacing: 12) {
                        content()
                    }
                    .padding(16)
                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .strokeBorder(.quaternary, lineWidth: 1)
                    )
                }
                .padding(20)
            }
        }
    }
}

#Preview {
    NavigationStack { LoginView() }
}
