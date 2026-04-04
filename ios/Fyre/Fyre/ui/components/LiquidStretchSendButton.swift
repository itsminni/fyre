//
//  LiquidStretchSendButton.swift
//  Fyre
//
//  Created by Gabriele Mininni on 10/03/26.
//

import SwiftUI
import UIKit

// Send button stretches toward drag direction for a "liquid" feel.
struct LiquidStretchSendButton: View {
    @Environment(\.colorScheme) private var colorScheme
    let isEnabled: Bool
    let action: () -> Void
    var size: CGFloat = 38
    var gradientColors: [Color] = [Color.orange, Color.red]
    var allowsLiquidInteraction: Bool = true
    var sharedStretchProgress: CGFloat = 0
    var contrastBoost: Bool = false

    @GestureState private var dragOffset: CGSize = .zero

    var body: some View {
        Button(action: action) {
            Image(systemName: "paperplane.fill")
                .font(.system(size: max(16, size * 0.36), weight: .semibold))
                .foregroundStyle(iconForegroundColor)
                .frame(width: size, height: size)
                .background(
                    LinearGradient(
                        colors: normalizedGradientColors,
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    in: Circle()
                )
                .overlay(
                    Circle()
                        .stroke(buttonBorderColor, lineWidth: contrastBoost ? 1.2 : 1)
                )
                .scaleEffect(x: resolvedStretchX, y: resolvedStretchY)
                .offset(
                    x: supportsLiquidInteraction ? dragOffset.width * 0.14 : 0,
                    y: supportsLiquidInteraction ? dragOffset.height * 0.14 : 0
                )
                .shadow(color: shadowColor, radius: contrastBoost ? size * 0.34 : size * 0.26, x: 0, y: size * 0.16)
                .animation(
                    supportsLiquidInteraction
                    ? .spring(response: 0.26, dampingFraction: 0.7)
                    : nil,
                    value: dragOffset
                )
                .animation(.spring(response: 0.28, dampingFraction: 0.8), value: clampedSharedProgress)
                .background {
                    if contrastBoost {
                        Circle()
                            .fill(Color.black.opacity(colorScheme == .dark ? 0.12 : 0.08))
                            .frame(width: size + 8, height: size + 8)
                    }
                }
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled)
        .opacity(isEnabled ? 1 : 0.55)
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .updating($dragOffset) { value, state, _ in
                    guard supportsLiquidInteraction else { return }
                    state = CGSize(
                        width: min(max(value.translation.width, -16), 16),
                        height: min(max(value.translation.height, -16), 16)
                    )
                }
        )
    }

    private var supportsLiquidInteraction: Bool {
        guard allowsLiquidInteraction else {
            return false
        }

        if #available(iOS 26, *) {
            return true
        }

        return false
    }

    private var stretchX: CGFloat {
        1 + max(0, (abs(dragOffset.width) - abs(dragOffset.height)) / 130)
    }

    private var stretchY: CGFloat {
        1 + max(0, (abs(dragOffset.height) - abs(dragOffset.width)) / 130)
    }

    private var clampedSharedProgress: CGFloat {
        min(max(sharedStretchProgress, 0), 1)
    }

    private var sharedStretchX: CGFloat {
        1 + (clampedSharedProgress * 0.12)
    }

    private var sharedStretchY: CGFloat {
        1 - (clampedSharedProgress * 0.07)
    }

    private var resolvedStretchX: CGFloat {
        (supportsLiquidInteraction ? stretchX : 1) * sharedStretchX
    }

    private var resolvedStretchY: CGFloat {
        (supportsLiquidInteraction ? stretchY : 1) * sharedStretchY
    }

    private var normalizedGradientColors: [Color] {
        gradientColors.isEmpty ? [Color.orange, Color.red] : gradientColors
    }

    private var shadowBaseColor: Color {
        normalizedGradientColors.first ?? .orange
    }

    private var iconForegroundColor: Color {
        if contrastBoost && averageGradientLuminance > 0.62 {
            return Color.black.opacity(0.74)
        }

        return .white
    }

    private var buttonBorderColor: Color {
        if contrastBoost {
            return colorScheme == .dark ? Color.white.opacity(0.34) : Color.black.opacity(0.22)
        }

        return colorScheme == .dark ? Color.white.opacity(0.3) : Color.black.opacity(0.10)
    }

    private var shadowColor: Color {
        if contrastBoost {
            return Color.black.opacity(colorScheme == .dark ? 0.34 : 0.26)
        }

        return shadowBaseColor.opacity(colorScheme == .dark ? 0.28 : 0.20)
    }

    private var averageGradientLuminance: CGFloat {
        guard !normalizedGradientColors.isEmpty else { return 0.5 }

        let luminance = normalizedGradientColors.reduce(CGFloat.zero) { partial, color in
            partial + color.uiLuminance
        }

        return luminance / CGFloat(normalizedGradientColors.count)
    }
}

private extension Color {
    var uiLuminance: CGFloat {
        let uiColor = UIColor(self)
        var red: CGFloat = 0
        var green: CGFloat = 0
        var blue: CGFloat = 0
        var alpha: CGFloat = 0

        guard uiColor.getRed(&red, green: &green, blue: &blue, alpha: &alpha) else {
            return 0.5
        }

        return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue)
    }
}
