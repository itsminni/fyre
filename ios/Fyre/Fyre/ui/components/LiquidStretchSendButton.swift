//
//  LiquidStretchSendButton.swift
//  Fyre
//
//  Created by Gabriele Mininni on 10/03/26.
//

import SwiftUI

// Send button stretches toward drag direction for a "liquid" feel.
struct LiquidStretchSendButton: View {
    @Environment(\.colorScheme) private var colorScheme
    let isEnabled: Bool
    let action: () -> Void
    var size: CGFloat = 38
    var gradientColors: [Color] = [Color.orange, Color.red]

    @GestureState private var dragOffset: CGSize = .zero

    var body: some View {
        Button(action: action) {
            Image(systemName: "paperplane.fill")
                .font(.system(size: max(16, size * 0.36), weight: .semibold))
                .foregroundStyle(.white)
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
                        .stroke(colorScheme == .dark ? Color.white.opacity(0.3) : Color.black.opacity(0.10), lineWidth: 1)
                )
                .scaleEffect(x: supportsLiquidInteraction ? stretchX : 1, y: supportsLiquidInteraction ? stretchY : 1)
                .offset(
                    x: supportsLiquidInteraction ? dragOffset.width * 0.14 : 0,
                    y: supportsLiquidInteraction ? dragOffset.height * 0.14 : 0
                )
                .shadow(color: shadowBaseColor.opacity(colorScheme == .dark ? 0.28 : 0.20), radius: size * 0.26, x: 0, y: size * 0.13)
                .animation(
                    supportsLiquidInteraction
                    ? .spring(response: 0.26, dampingFraction: 0.7)
                    : nil,
                    value: dragOffset
                )
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

    private var normalizedGradientColors: [Color] {
        gradientColors.isEmpty ? [Color.orange, Color.red] : gradientColors
    }

    private var shadowBaseColor: Color {
        normalizedGradientColors.first ?? .orange
    }
}
