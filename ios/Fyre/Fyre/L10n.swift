//
//  L10n.swift
//  Fyre
//
//  Created by Gabriele Mininni on 17/03/26.
//

import Foundation

// Lightweight localization helper.
// Note: actual translations live in `Localizable.strings` per language.
enum L10n {
    nonisolated static func tr(_ key: String) -> String {
        NSLocalizedString(key, comment: "")
    }
}
