//
//  ThreadNaming.swift
//  Fyre
//
//  Created by Gabriele Mininni on 03/04/26.
//

import Foundation

enum ThreadNaming {
    nonisolated static let placeholderTitle = "Match"
    nonisolated static let legacyPlaceholderTitle = "Fyre match"

    nonisolated static func isPlaceholderThreadName(_ name: String) -> Bool {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty || trimmed == placeholderTitle || trimmed == legacyPlaceholderTitle
    }

    nonisolated static func displayName(firstName: String?, lastName: String?, email: String?, fallback: String?) -> String {
        let fullName = [firstName, lastName]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: " ")

        if !fullName.isEmpty {
            return fullName
        }

        if let emailName = discoverFallbackName(email: email) {
            return emailName
        }

        if let fallback,
           !isPlaceholderThreadName(fallback) {
            return fallback.trimmingCharacters(in: .whitespacesAndNewlines)
        }

        return placeholderTitle
    }

    nonisolated static func discoverFallbackName(email: String?) -> String? {
        guard let email,
              let localPart = email.split(separator: "@").first,
              !localPart.isEmpty else {
            return nil
        }

        return String(localPart)
    }
}
