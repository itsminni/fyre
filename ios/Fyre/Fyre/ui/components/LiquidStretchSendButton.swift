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

    @GestureState private var dragOffset: CGSize = .zero

    var body: some View {
        Button(action: action) {
            Image(systemName: "paperplane.fill")
                .font(.body.weight(.semibold))
                .foregroundStyle(.white)
                .frame(width: 38, height: 38)
                .background(
                    LinearGradient(
                        colors: [Color.orange, Color.red],
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
                .shadow(color: Color.orange.opacity(colorScheme == .dark ? 0.28 : 0.20), radius: 10, x: 0, y: 5)
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
}
