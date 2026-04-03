//
//  ChatBackgroundStyle.swift
//  Fyre
//
//  Created by Gabriele Mininni on 03/04/26.
//

import SwiftUI
import UIKit

extension Color {
    init?(hex: String) {
        let cleaned = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        guard cleaned.count == 6 || cleaned.count == 8,
              let value = UInt64(cleaned, radix: 16) else {
            return nil
        }

        let a, r, g, b: UInt64
        if cleaned.count == 8 {
            a = (value & 0xFF00_0000) >> 24
            r = (value & 0x00FF_0000) >> 16
            g = (value & 0x0000_FF00) >> 8
            b = value & 0x0000_00FF
        } else {
            a = 255
            r = (value & 0xFF00_00) >> 16
            g = (value & 0x00FF_00) >> 8
            b = value & 0x0000_FF
        }

        self = Color(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }

    var hexRGB: String? {
        let uiColor = UIColor(self)
        var red: CGFloat = 0
        var green: CGFloat = 0
        var blue: CGFloat = 0
        var alpha: CGFloat = 0

        guard uiColor.getRed(&red, green: &green, blue: &blue, alpha: &alpha) else {
            return nil
        }

        return String(
            format: "#%02X%02X%02X",
            Int(round(red * 255)),
            Int(round(green * 255)),
            Int(round(blue * 255))
        )
    }
}

enum ChatBubblePalette: String, CaseIterable, Identifiable {
    case `default`
    case coral
    case ocean
    case violet
    case emerald
    case graphite

    var id: String { rawValue }

    var localizationKey: String {
        switch self {
        case .default: return "account.chatBubble.default"
        case .coral: return "account.chatBubble.coral"
        case .ocean: return "account.chatBubble.ocean"
        case .violet: return "account.chatBubble.violet"
        case .emerald: return "account.chatBubble.emerald"
        case .graphite: return "account.chatBubble.graphite"
        }
    }

    func fillStyle(colorScheme: ColorScheme, isOutgoing: Bool) -> AnyShapeStyle {
        switch self {
        case .default:
            if isOutgoing {
                if colorScheme == .dark {
                    return AnyShapeStyle(
                        LinearGradient(
                            colors: [
                                Color(red: 0.96, green: 0.47, blue: 0.15),
                                Color(red: 0.84, green: 0.33, blue: 0.20)
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                }

                return AnyShapeStyle(
                    LinearGradient(
                        colors: [
                            Color(red: 1.00, green: 0.88, blue: 0.74),
                            Color(red: 1.00, green: 0.80, blue: 0.69)
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
            }

            return AnyShapeStyle(
                Color(uiColor: colorScheme == .dark ? .secondarySystemBackground : .systemGray6)
            )
        case .coral:
            return AnyShapeStyle(Color(red: 0.93, green: 0.42, blue: 0.28))
        case .ocean:
            return AnyShapeStyle(Color(red: 0.16, green: 0.49, blue: 0.89))
        case .violet:
            return AnyShapeStyle(Color(red: 0.54, green: 0.37, blue: 0.90))
        case .emerald:
            return AnyShapeStyle(Color(red: 0.16, green: 0.63, blue: 0.46))
        case .graphite:
            return AnyShapeStyle(
                Color(uiColor: colorScheme == .dark ? .systemGray5 : .systemGray4)
            )
        }
    }

    func textColor(colorScheme: ColorScheme, isOutgoing: Bool) -> Color {
        switch self {
        case .default:
            if isOutgoing {
                return colorScheme == .dark ? .white : Color(red: 0.29, green: 0.15, blue: 0.07)
            }
            return .primary
        case .graphite:
            return colorScheme == .dark ? .white : .primary
        default:
            return .white
        }
    }

    func strokeColor(colorScheme: ColorScheme, isOutgoing: Bool) -> Color {
        switch self {
        case .default:
            if isOutgoing {
                return colorScheme == .dark ? .white.opacity(0.14) : .orange.opacity(0.35)
            }
            return colorScheme == .dark ? .white.opacity(0.12) : .black.opacity(0.08)
        case .graphite:
            return colorScheme == .dark ? .white.opacity(0.12) : .black.opacity(0.08)
        default:
            return .white.opacity(colorScheme == .dark ? 0.10 : 0.18)
        }
    }
}

enum ChatBackgroundStyle: String, CaseIterable, Identifiable {
    case defaultDark
    case graphite
    case ember
    case ocean
    case forest

    var id: String { rawValue }

    var localizationKey: String {
        switch self {
        case .defaultDark:
            return "account.chatBackground.default"
        case .graphite:
            return "account.chatBackground.graphite"
        case .ember:
            return "account.chatBackground.ember"
        case .ocean:
            return "account.chatBackground.ocean"
        case .forest:
            return "account.chatBackground.forest"
        }
    }

    @ViewBuilder
    func backgroundView(colorScheme: ColorScheme) -> some View {
        switch self {
        case .defaultDark:
            Color(uiColor: .systemBackground)

        case .graphite:
            LinearGradient(
                colors: colorScheme == .dark
                ? [
                    Color(red: 0.07, green: 0.07, blue: 0.08),
                    Color(red: 0.10, green: 0.10, blue: 0.11),
                    Color(red: 0.05, green: 0.05, blue: 0.06)
                ]
                : [
                    Color(red: 0.94, green: 0.94, blue: 0.95),
                    Color(red: 0.89, green: 0.89, blue: 0.90),
                    Color(red: 0.96, green: 0.96, blue: 0.97)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

        case .ember:
            ZStack {
                LinearGradient(
                    colors: colorScheme == .dark
                    ? [
                        Color(red: 0.08, green: 0.05, blue: 0.04),
                        Color(red: 0.11, green: 0.06, blue: 0.05),
                        Color(red: 0.05, green: 0.03, blue: 0.03)
                    ]
                    : [
                        Color(red: 0.99, green: 0.95, blue: 0.92),
                        Color(red: 0.97, green: 0.90, blue: 0.86),
                        Color(red: 0.99, green: 0.96, blue: 0.93)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )

                Circle()
                    .fill(Color.orange.opacity(colorScheme == .dark ? 0.11 : 0.10))
                    .frame(width: 280, height: 280)
                    .blur(radius: 70)
                    .offset(x: 120, y: -220)

                Circle()
                    .fill(Color.red.opacity(colorScheme == .dark ? 0.10 : 0.08))
                    .frame(width: 260, height: 260)
                    .blur(radius: 80)
                    .offset(x: -130, y: 280)
            }

        case .ocean:
            ZStack {
                LinearGradient(
                    colors: colorScheme == .dark
                    ? [
                        Color(red: 0.03, green: 0.10, blue: 0.15),
                        Color(red: 0.05, green: 0.14, blue: 0.19),
                        Color(red: 0.02, green: 0.07, blue: 0.10)
                    ]
                    : [
                        Color(red: 0.90, green: 0.96, blue: 0.99),
                        Color(red: 0.84, green: 0.93, blue: 0.98),
                        Color(red: 0.93, green: 0.97, blue: 1.00)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )

                Circle()
                    .fill(Color.cyan.opacity(colorScheme == .dark ? 0.10 : 0.10))
                    .frame(width: 260, height: 260)
                    .blur(radius: 80)
                    .offset(x: -150, y: -220)

                Circle()
                    .fill(Color.blue.opacity(colorScheme == .dark ? 0.10 : 0.08))
                    .frame(width: 300, height: 300)
                    .blur(radius: 90)
                    .offset(x: 150, y: 260)
            }

        case .forest:
            ZStack {
                LinearGradient(
                    colors: colorScheme == .dark
                    ? [
                        Color(red: 0.04, green: 0.09, blue: 0.06),
                        Color(red: 0.06, green: 0.12, blue: 0.08),
                        Color(red: 0.03, green: 0.06, blue: 0.04)
                    ]
                    : [
                        Color(red: 0.93, green: 0.97, blue: 0.93),
                        Color(red: 0.88, green: 0.95, blue: 0.89),
                        Color(red: 0.95, green: 0.98, blue: 0.95)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )

                Circle()
                    .fill(Color.green.opacity(colorScheme == .dark ? 0.11 : 0.09))
                    .frame(width: 260, height: 260)
                    .blur(radius: 90)
                    .offset(x: -160, y: -230)

                Circle()
                    .fill(Color.mint.opacity(colorScheme == .dark ? 0.08 : 0.08))
                    .frame(width: 240, height: 240)
                    .blur(radius: 80)
                    .offset(x: 140, y: 260)
            }
        }
    }
}
