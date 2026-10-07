import SwiftUI

struct EventPreviewCard: View {
    @Environment(\.colorScheme) private var colorScheme
    let snapshot: MainEventSnapshot
    let dateText: String
    let deadlineText: String?
    let venueText: String?
    let registrationText: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            EventPosterSection(
                height: 280,
                gradientColors: [.clear, .black.opacity(0.18), .black.opacity(0.85)],
                contentPadding: 20
            ) {
                VStack(alignment: .leading, spacing: 12) {
                    if let registrationText {
                        Text(registrationText)
                            .font(.caption.weight(.semibold))
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(.orange.opacity(0.9), in: Capsule())
                    }

                    Text(snapshot.title)
                        .font(.system(.title2, design: .rounded).weight(.bold))
                        .foregroundStyle(.white)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)

                    Text(dateText)
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.92))
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            VStack(alignment: .leading, spacing: 16) {
                if let venueText {
                    EventInfoLine(icon: "building.2.fill", text: venueText)
                }
                if let deadlineText {
                    EventDeadlineBanner(text: deadlineText)
                }

                LazyVGrid(
                    columns: [GridItem(.adaptive(minimum: 86), spacing: 12)],
                    alignment: .leading,
                    spacing: 12
                ) {
                    EventMiniBadge(
                        text: "M \(snapshot.maleCount)/\(max(1, snapshot.maleLimit))",
                        icon: "figure.stand"
                    )
                    EventMiniBadge(
                        text: "F \(snapshot.femaleCount)/\(max(1, snapshot.femaleLimit))",
                        icon: "figure.dress.line.vertical.figure"
                    )
                    EventMiniBadge(
                        text: "\(snapshot.totalCount)/\(snapshot.maxParticipants)",
                        icon: "person.2.fill"
                    )
                }

            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(20)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .fill(eventCardFill(for: colorScheme))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .stroke(eventCardStroke(for: colorScheme), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
        .shadow(color: eventCardShadow(for: colorScheme), radius: colorScheme == .dark ? 24 : 14, y: colorScheme == .dark ? 12 : 6)
    }
}

struct EventPosterHero: View {
    @Environment(\.colorScheme) private var colorScheme
    let snapshot: MainEventSnapshot
    let dateText: String
    let venueText: String?
    let registrationText: String?

    var body: some View {
        EventPosterSection(
            height: 320,
            gradientColors: [.clear, .black.opacity(0.18), .black.opacity(0.88)],
            contentPadding: 22
        ) {
            VStack(alignment: .leading, spacing: 12) {
                if let registrationText {
                    Text(registrationText)
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(.orange.opacity(0.92), in: Capsule())
                }

                if let venueText {
                    EventPosterOverlayBadge(text: venueText, icon: "building.2.fill")
                }

                Text(snapshot.title)
                    .font(.system(.largeTitle, design: .rounded).weight(.bold))
                    .foregroundStyle(.white)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)

                Text(dateText)
                    .font(.headline)
                    .foregroundStyle(.white.opacity(0.92))
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .stroke(eventCardStroke(for: colorScheme), lineWidth: 1)
        )
        .shadow(color: eventCardShadow(for: colorScheme), radius: colorScheme == .dark ? 24 : 14, y: colorScheme == .dark ? 12 : 6)
    }
}

struct EventPosterSection<Overlay: View>: View {
    let height: CGFloat
    let gradientColors: [Color]
    let contentPadding: CGFloat
    @ViewBuilder var overlay: Overlay

    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .bottomLeading) {
                Image("PartyPoster")
                    .resizable()
                    .scaledToFill()
                    .frame(width: geometry.size.width, height: geometry.size.height)
                    .clipped()

                LinearGradient(
                    colors: gradientColors,
                    startPoint: .top,
                    endPoint: .bottom
                )

                overlay
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(contentPadding)
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: height)
        .clipped()
    }
}

struct EventSurface<Content: View>: View {
    @Environment(\.colorScheme) private var colorScheme
    let title: String
    let icon: String
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(spacing: 10) {
                Image(systemName: icon)
                    .foregroundStyle(.orange)
                    .font(.headline)
                    .frame(width: 30, height: 30)
                    .background(eventIconBadgeFill(for: colorScheme), in: RoundedRectangle(cornerRadius: 10, style: .continuous))

                Text(title)
                    .font(.title3.weight(.semibold))
            }

            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .background(
            RoundedRectangle(cornerRadius: 26, style: .continuous)
                .fill(eventCardFill(for: colorScheme))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 26, style: .continuous)
                .stroke(eventCardStroke(for: colorScheme), lineWidth: 1)
        )
        .shadow(color: eventCardShadow(for: colorScheme), radius: colorScheme == .dark ? 20 : 12, y: colorScheme == .dark ? 10 : 5)
    }
}

struct EventInfoLine: View {
    let icon: String
    let text: String

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .foregroundStyle(.orange)
                .frame(width: 18, alignment: .center)

            Text(text)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct EventFeatureBadge: View {
    @Environment(\.colorScheme) private var colorScheme
    let text: String
    let icon: String

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: icon)
                .foregroundStyle(.orange)
                .font(.caption.weight(.semibold))

            Text(text)
                .font(.caption.weight(.semibold))
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(eventBadgeFill(for: colorScheme), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(eventBadgeStroke(for: colorScheme), lineWidth: 1)
        )
    }
}

struct EventDeadlineBanner: View {
    @Environment(\.colorScheme) private var colorScheme
    let text: String

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "hourglass")
                .foregroundStyle(.orange)
                .font(.subheadline.weight(.semibold))

            Text(text)
                .font(.caption.weight(.semibold))
                .multilineTextAlignment(.leading)
                .foregroundStyle(.primary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(eventDeadlineFill(for: colorScheme), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(eventDeadlineStroke(for: colorScheme), lineWidth: 1)
        )
    }
}

struct EventMiniBadge: View {
    @Environment(\.colorScheme) private var colorScheme
    let text: String
    let icon: String

    var body: some View {
        Label(text, systemImage: icon)
            .font(.caption.weight(.semibold))
            .foregroundStyle(.primary)
            .lineLimit(1)
            .minimumScaleFactor(0.85)
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(eventBadgeFill(for: colorScheme), in: Capsule())
            .overlay(
                Capsule()
                    .stroke(eventBadgeStroke(for: colorScheme), lineWidth: 1)
            )
    }
}

struct EventPosterOverlayBadge: View {
    let text: String
    let icon: String

    var body: some View {
        Label(text, systemImage: icon)
            .font(.caption.weight(.semibold))
            .foregroundStyle(.white)
            .lineLimit(1)
            .minimumScaleFactor(0.85)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(
                .black.opacity(0.48),
                in: Capsule()
            )
            .overlay(
                Capsule()
                    .stroke(.white.opacity(0.14), lineWidth: 1)
            )
            .shadow(color: .black.opacity(0.22), radius: 10, y: 5)
    }
}

struct EventMetricTile: View {
    @Environment(\.colorScheme) private var colorScheme
    let title: String
    let value: String
    var caption: String? = nil
    let accent: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)

            Text(value)
                .font(.title3.weight(.bold))

            if let caption {
                Text(caption)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(accent.opacity(colorScheme == .dark ? 0.12 : 0.16), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(accent.opacity(colorScheme == .dark ? 0.16 : 0.28), lineWidth: 1)
        )
    }
}

struct EventActionBar: View {
    @Environment(\.colorScheme) private var colorScheme
    let title: String
    let role: ButtonRole?
    let message: String?
    let isError: Bool
    let isLoading: Bool
    let action: () -> Void

    var body: some View {
        if #available(iOS 26.0, *) {
            VStack(spacing: 10) {
                if let message {
                    Text(message)
                        .font(.footnote)
                        .foregroundStyle(isError ? Color.red : Color.secondary)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 9)
                        .glassEffect(in: Capsule(style: .continuous))
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                Button(role: role, action: action) {
                    Text(title)
                        .font(.headline.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 11)
                        .padding(.horizontal, 16)
                }
                .buttonStyle(.glassProminent)
                .controlSize(.regular)
                .tint(role == .destructive ? .red : .orange)
                .disabled(isLoading)
                .opacity(isLoading ? 0.72 : 1)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 6)
        } else {
            VStack(spacing: 10) {
                Button(title, role: role, action: action)
                    .buttonStyle(EventPrimaryActionStyle(isDestructive: role == .destructive))
                    .disabled(isLoading)
                    .opacity(isLoading ? 0.72 : 1)

                if let message {
                    Text(message)
                        .font(.footnote)
                        .foregroundStyle(isError ? .red : .secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 10)
            .background(
                Group {
                    if colorScheme == .dark {
                        Rectangle().fill(.ultraThinMaterial)
                    } else {
                        Rectangle().fill(Color(uiColor: .systemBackground).opacity(0.96))
                    }
                }
                .ignoresSafeArea(edges: .bottom)
            )
            .overlay(alignment: .top) {
                Rectangle()
                    .fill(colorScheme == .dark ? .white.opacity(0.08) : .black.opacity(0.08))
                    .frame(height: 1)
            }
        }
    }
}

struct EventPrimaryActionStyle: ButtonStyle {
    let isDestructive: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline.weight(.semibold))
            .foregroundStyle(.white)
            .padding(.vertical, 16)
            .padding(.horizontal, 18)
            .frame(maxWidth: .infinity)
            .background(
                LinearGradient(
                    colors: isDestructive
                    ? [Color.red, Color.red.opacity(0.82)]
                    : [Color.orange, Color.orange.opacity(0.82)],
                    startPoint: .leading,
                    endPoint: .trailing
                ),
                in: RoundedRectangle(cornerRadius: 20, style: .continuous)
            )
            .scaleEffect(configuration.isPressed ? 0.985 : 1)
            .animation(.easeOut(duration: 0.16), value: configuration.isPressed)
    }
}

struct EventScreenBackground: View {
    var body: some View {
        LinearGradient(
            colors: [
                Color(uiColor: .systemGroupedBackground),
                Color(uiColor: .secondarySystemGroupedBackground)
            ],
            startPoint: .top,
            endPoint: .bottom
        )
    }
}

private func eventCardFill(for colorScheme: ColorScheme) -> Color {
    Color(uiColor: colorScheme == .dark ? .secondarySystemGroupedBackground : .systemBackground)
}

private func eventCardStroke(for colorScheme: ColorScheme) -> Color {
    colorScheme == .dark ? .white.opacity(0.06) : .black.opacity(0.10)
}

private func eventCardShadow(for colorScheme: ColorScheme) -> Color {
    colorScheme == .dark ? .black.opacity(0.18) : .black.opacity(0.10)
}

private func eventBadgeFill(for colorScheme: ColorScheme) -> Color {
    colorScheme == .dark ? .white.opacity(0.08) : .orange.opacity(0.10)
}

private func eventBadgeStroke(for colorScheme: ColorScheme) -> Color {
    colorScheme == .dark ? .white.opacity(0.08) : .orange.opacity(0.20)
}

private func eventDeadlineFill(for colorScheme: ColorScheme) -> Color {
    colorScheme == .dark ? .orange.opacity(0.12) : .orange.opacity(0.16)
}

private func eventDeadlineStroke(for colorScheme: ColorScheme) -> Color {
    colorScheme == .dark ? .orange.opacity(0.18) : .orange.opacity(0.30)
}

private func eventIconBadgeFill(for colorScheme: ColorScheme) -> Color {
    colorScheme == .dark ? .orange.opacity(0.12) : .orange.opacity(0.18)
}
