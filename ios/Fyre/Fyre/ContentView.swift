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
            switch router.root {
            case .loading:
                ProgressView()
                    .controlSize(.large)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color(.systemBackground).ignoresSafeArea())
                    .accessibilityIdentifier("session.bootstrap.loading")
            case let .bootstrapFailed(failure):
                VStack(spacing: 20) {
                    Image(systemName: failure == .configuration ? "exclamationmark.triangle" : "wifi.exclamationmark")
                        .font(.largeTitle)
                    Text(L10n.tr(failure == .configuration ? "startup.configuration.title" : "startup.session.title"))
                        .font(.title2.bold())
                    Text(L10n.tr(failure == .configuration ? "startup.configuration.message" : "startup.session.message"))
                        .foregroundStyle(.secondary)
#if DEBUG
                    if failure == .configuration, let detail = store.configurationFailureDetail {
                        Text(detail).font(.caption).foregroundStyle(.secondary)
                    }
#endif
                    if failure == .unavailable {
                        Button(L10n.tr("startup.retry")) {
                            Task { await bootstrap() }
                        }
                        .buttonStyle(.borderedProminent)
                        .accessibilityIdentifier("session.bootstrap.retry")
                    }
                }
                .multilineTextAlignment(.center)
                .padding(24)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .accessibilityIdentifier("session.bootstrap.failed")
            case .main:
                if store.isProfileComplete {
                    MainTabView()
                } else {
                    ProfileSetupView()
                }
            case .auth:
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
        .onChange(of: store.isLoggedIn) { _, isLoggedIn in
            guard store.isSessionBootstrapComplete else { return }
            router.sync(isLoggedIn: isLoggedIn)
        }
        .task {
            await bootstrap()
        }
    }
    @MainActor
    private func bootstrap() async {
        router.beginBootstrap()
        await store.restoreRemoteSessionIfNeeded()
        router.completeBootstrap(isLoggedIn: store.isLoggedIn, failure: store.sessionBootstrapFailure)
    }
}

#Preview {
    ContentView()
        .environment(UserStore.shared)
        .environmentObject(AppRouter())
}
