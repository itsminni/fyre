//
//  ContentView.swift
//  Fyre
//
//  Created by Gabriele Mininni on 11/02/26.
//

import SwiftUI

struct ContentView: View {
    var body: some View {
        NavigationStack {
            ZStack {
                // Minimal modern gradient background
                LinearGradient(colors: [Color.pink.opacity(0.25), Color.purple.opacity(0.25)], startPoint: .topLeading, endPoint: .bottomTrailing)
                    .ignoresSafeArea()

                VStack(spacing: 24) {
                    Spacer()

                    VStack(spacing: 8) {
                        Text("Fyre")
                            .font(.system(size: 48, weight: .bold, design: .rounded))
                            .kerning(1.2)
                        Text("Incontra persone. Accendi connessioni.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)

                    Spacer()

                    VStack(spacing: 12) {
                        NavigationLink {
                            LoginView()
                        } label: {
                            Text("Log in")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.pink)
                        .controlSize(.large)

                        NavigationLink {
                            SignUpView()
                        } label: {
                            Text("Sign up")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                        .tint(.pink)
                        .controlSize(.large)
                    }
                    .padding(.horizontal, 24)
                    .padding(.bottom, 24)
                }
            }
            .navigationBarHidden(true)
        }
    }
}

#Preview {
    ContentView()
}
