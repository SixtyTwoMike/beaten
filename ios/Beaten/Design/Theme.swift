import SwiftUI

// Colours from the web's globals.css @theme, so the app and beaten.games match.
extension Color {
    static let canvas = Color(hex: 0x0E1216)
    static let card = Color(hex: 0x161C23)
    static let card2 = Color(hex: 0x1D2530)
    static let edge = Color(hex: 0x26303B)
    static let fog = Color(hex: 0x8FA0B0)
    static let mint = Color(hex: 0x00D474)
    static let gold = Color(hex: 0xFFB43A)
    static let sky = Color(hex: 0x38BDF8)

    init(hex: UInt32) {
        self.init(
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255
        )
    }
}

extension PlayStatus {
    var label: String {
        switch self {
        case .playing: "Playing"
        case .beaten: "Beaten"
        case .mastered: "Mastered"
        case .shelved: "Shelved"
        }
    }

    var symbol: String {
        switch self {
        case .playing: "play.fill"
        case .beaten: "checkmark"
        case .mastered: "star.fill"
        case .shelved: "pause.fill"
        }
    }

    // STATUS_ACCENT in src/lib/status.ts
    var accent: Color {
        switch self {
        case .playing: .sky
        case .beaten: .mint
        case .mastered: .gold
        case .shelved: .fog
        }
    }
}

// The wordmark: white Futura caps, widely tracked (src/components/Logo.tsx).
struct Logo: View {
    var size: CGFloat = 22

    var body: some View {
        Text("BEATEN")
            .font(.custom("Futura-Medium", size: size))
            .tracking(size * 0.15)
            .foregroundStyle(.white)
            .accessibilityLabel("Beaten")
    }
}

struct StatusBadge: View {
    let status: PlayStatus

    var body: some View {
        Label(status.label, systemImage: status.symbol)
            .font(.caption.weight(.semibold))
            .labelStyle(.titleAndIcon)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .foregroundStyle(status.accent)
            .background(status.accent.opacity(0.14), in: Capsule())
    }
}

// Box art, 3:4 like IGDB covers, with a plain card while it loads or when
// there's none.
struct Poster: View {
    let url: URL?
    var width: CGFloat = 60

    var body: some View {
        AsyncImage(url: url) { phase in
            if let image = phase.image {
                image.resizable().scaledToFill()
            } else {
                Rectangle().fill(Color.card2)
                    .overlay {
                        Image(systemName: "gamecontroller")
                            .foregroundStyle(Color.fog.opacity(0.5))
                    }
            }
        }
        .frame(width: width, height: width * 4 / 3)
        .clipShape(RoundedRectangle(cornerRadius: width / 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: width / 12, style: .continuous)
                .strokeBorder(Color.white.opacity(0.08))
        )
        .accessibilityHidden(true)
    }
}

// Read-only half stars for a 1–10 rating.
struct Stars: View {
    let rating: Int
    var size: CGFloat = 12

    var body: some View {
        HStack(spacing: 1) {
            ForEach(1...5, id: \.self) { star in
                Image(systemName: rating >= star * 2 ? "star.fill" : rating == star * 2 - 1 ? "star.leadinghalf.filled" : "star")
                    .font(.system(size: size))
                    .foregroundStyle(rating >= star * 2 - 1 ? Color.mint : Color.fog.opacity(0.4))
            }
        }
        .accessibilityElement()
        .accessibilityLabel(String(format: "%g stars", Double(rating) / 2))
    }
}

struct ErrorBanner: View {
    let message: String

    var body: some View {
        Label(message, systemImage: "exclamationmark.triangle.fill")
            .font(.footnote)
            .foregroundStyle(.white)
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.red.opacity(0.25), in: RoundedRectangle(cornerRadius: 10))
    }
}

extension View {
    // Dark canvas behind lists and scroll views.
    func canvasBackground() -> some View {
        scrollContentBackground(.hidden).background(Color.canvas)
    }
}
