//
//  ContentView.swift
//  Fyre
//
//  Created by Gabriele Mininni on 11/02/26.
//

import SwiftUI

struct ContentView: View {
    @Environment(UserStore.self) private var store
    @EnvironmentObject private var router: AppRouter

    var body: some View {
        Group {
            if router.root == .main {
                if store.isProfileComplete {
                    MainTabView()
                } else {
                    ProfileSetupView()
                }
            } else {
            NavigationStack {
                VStack(spacing: 24) {
                    Spacer()

                    VStack(spacing: 8) {
                        Text(L10n.tr("app.name"))
                            .font(.system(size: 48, weight: .bold, design: .rounded))
                            .kerning(1.2)
                        Text(L10n.tr("landing.tagline"))
                            .font(.title2.bold())
                            .foregroundStyle(.secondary)
                    }
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)

                    Spacer()

                    VStack(spacing: 12) {
                        NavigationLink(destination: LoginView()) {
                            Text(L10n.tr("auth.login.action"))
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.pink)
                        .controlSize(.large)
                        .accessibilityIdentifier("landing.login")

                        NavigationLink(destination: SignUpView()) {
                            Text(L10n.tr("auth.signup.action"))
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                        .tint(.pink)
                        .controlSize(.large)
                        .accessibilityIdentifier("landing.signup")
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
        .onAppear {
            router.sync(isLoggedIn: store.isLoggedIn)
        }
        .onChange(of: store.isLoggedIn) { _, isLoggedIn in
            router.sync(isLoggedIn: isLoggedIn)
        }
    }
}

#Preview {
    ContentView()
        .environment(UserStore.shared)
        .environmentObject(AppRouter())
}
