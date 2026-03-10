//
//  LiquidStretchSendButton.swift
//  Fyre
//
//  Created by Gabriele Mininni on 10/03/26.
//

import SwiftUI

// Send button stretches toward drag direction for a "liquid" feel.
struct LiquidStretchSendButton: View {
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
                        .stroke(Color.white.opacity(0.3), lineWidth: 1)
                )
                .scaleEffect(x: stretchX, y: stretchY)
                .offset(x: dragOffset.width * 0.14, y: dragOffset.height * 0.14)
                .shadow(color: Color.orange.opacity(0.28), radius: 10, x: 0, y: 5)
                .animation(.spring(response: 0.26, dampingFraction: 0.7), value: dragOffset)
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled)
        .opacity(isEnabled ? 1 : 0.55)
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .updating($dragOffset) { value, state, _ in
                    state = CGSize(
                        width: min(max(value.translation.width, -16), 16),
                        height: min(max(value.translation.height, -16), 16)
                    )
                }
        )
    }

    private var stretchX: CGFloat {
        1 + max(0, (abs(dragOffset.width) - abs(dragOffset.height)) / 130)
    }

    private var stretchY: CGFloat {
        1 + max(0, (abs(dragOffset.height) - abs(dragOffset.width)) / 130)
    }
}
