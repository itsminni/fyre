//
//  L10n.swift
//  Fyre
//
//  Created by Gabriele Mininni on 17/03/26.
//

import Foundation

// Lightweight localization helper
// - `tr(_:)` wraps `NSLocalizedString` so views call `L10n.tr("key")`
// - `greeting(_:)` demonstrates a localized formatted string with a name
// Note: actual translations live in `Localizable.strings` per language.
enum L10n {
    static func tr(_ key: String) -> String {
        NSLocalizedString(key, comment: "")
    }

    static func greeting(_ name: String) -> String {
        String(format: tr("home.greeting"), locale: Locale.autoupdatingCurrent, name)
    }
}
