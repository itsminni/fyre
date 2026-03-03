//
//  ContentView.swift
//  Fyre
//
//  Created by Gabriele Mininni on 11/02/26.
//

import SwiftUI

struct ContentView: View {
    @Environment(UserStore.self) private var store

    var body: some View {
        if store.isLoggedIn {
            HomeView()
        } else {
            NavigationStack {
                VStack(spacing: 24) {
                    Spacer()

                    VStack(spacing: 8) {
                        Text("Fyre")
                            .font(.system(size: 48, weight: .bold, design: .rounded))
                            .kerning(1.2)
                        Text("Dalla scintilla al fyre")
                            .font(.title2.bold())
                            .foregroundStyle(.secondary)
                    }
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)

                    Spacer()

                    VStack(spacing: 12) {
                        NavigationLink(destination: LoginView()) {
                            Text("Accedi")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.pink)
                        .controlSize(.large)

                        NavigationLink(destination: SignUpView()) {
                            Text("Registrati")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                        .tint(.pink)
                        .controlSize(.large)
                    }
                    .padding(.horizontal, 24)
                    .padding(.bottom, 24)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(
                    LinearGradient(
                        colors: [Color.pink.opacity(0.25), Color.purple.opacity(0.25)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                    .ignoresSafeArea()
                )
                .toolbar(.hidden, for: .navigationBar)
            }
        }
    }
}

// Simple logged-in placeholder - ai da cambiare
struct HomeView: View {
    @Environment(UserStore.self) private var store

    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            VStack(spacing: 8) {
                Text("Ciao, \(store.currentUser?.name ?? "")!")
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                Text(store.currentUser?.email ?? "")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Button {
                store.logOut()
            } label: {
                Text("Log out")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .tint(.pink)
            .controlSize(.large)
            .padding(.horizontal, 24)
            .padding(.bottom, 24)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemBackground))
    }
}

#Preview {
    ContentView()
        .environment(UserStore.shared)
}
