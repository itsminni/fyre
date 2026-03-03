//
//  FyreApp.swift
//  Fyre
//
//  Created by Gabriele Mininni on 11/02/26.
//

import SwiftUI

@main
struct FyreApp: App {
    @State private var store = UserStore.shared

    nonisolated init() {}

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(store)
        }
    }
}
