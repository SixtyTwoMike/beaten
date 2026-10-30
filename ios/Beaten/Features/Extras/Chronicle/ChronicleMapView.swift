import SwiftUI

// The zig-zag road through your consoles, as components/ChronicleMap.tsx
// draws it on the web: stops on alternate sides, the road swinging between
// their centres, in the chronicle's accent, background and path style.
struct ChronicleMapView: View {
    let chronicle: Chronicle
    var onTap: ((ChronicleStop) -> Void)?

    private var accent: Color { chronicle.accent.color }

    var body: some View {
        VStack(spacing: 0) {
            VStack(spacing: 6) {
                Text("CONSOLE CHRONICLES")
                    .font(.caption.weight(.semibold))
                    .tracking(3)
                    .foregroundStyle(accent)
                Text(chronicle.title)
                    .font(.title.bold())
                    .multilineTextAlignment(.center)
                Text(chronicle.summary)
                    .font(.subheadline)
                    .foregroundStyle(Color.fog)
            }
            .padding(.bottom, 28)

            if chronicle.stops.isEmpty {
                Text("No consoles yet.")
                    .font(.subheadline)
                    .foregroundStyle(Color.fog)
                    .padding(.vertical, 40)
            }
            ForEach(Array(chronicle.stops.enumerated()), id: \.element.id) { i, stop in
                if i > 0 {
                    Road(fromLeft: i % 2 == 1, path: chronicle.path, accent: accent)
                        .frame(height: 56)
                }
                StopCard(stop: stop, chronicle: chronicle)
                    .frame(maxWidth: .infinity, alignment: i % 2 == 1 ? .trailing : .leading)
                    .contentShape(Rectangle())
                    .onTapGesture { onTap?(stop) }
                    .accessibilityAddTraits(onTap == nil ? [] : .isButton)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 32)
        .background { ChronicleBackdrop(style: chronicle.background, accent: accent) }
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).strokeBorder(Color.edge))
    }
}

// Cards are 58% wide, so their centres sit at 29% and 71%.
nonisolated private struct RoadSegment: Shape {
    let fromLeft: Bool

    func path(in rect: CGRect) -> Path {
        let (a, b) = fromLeft ? (0.29, 0.71) : (0.71, 0.29)
        var p = Path()
        p.move(to: CGPoint(x: rect.width * a, y: 0))
        p.addCurve(
            to: CGPoint(x: rect.width * b, y: rect.height),
            control1: CGPoint(x: rect.width * a, y: rect.height * 0.7),
            control2: CGPoint(x: rect.width * b, y: rect.height * 0.3)
        )
        return p
    }
}

// The path styles: dotted trail, neon (glowing), pixel road (chunky dashes).
private struct Road: View {
    let fromLeft: Bool
    let path: ChroniclePath
    let accent: Color

    var body: some View {
        let segment = RoadSegment(fromLeft: fromLeft)
        switch path {
        case .neon:
            segment.stroke(accent, lineWidth: 3).shadow(color: accent, radius: 6)
        case .pixel:
            segment.stroke(accent.opacity(0.85), style: StrokeStyle(lineWidth: 8, dash: [10, 10]))
        case .dotted:
            segment.stroke(accent, style: StrokeStyle(lineWidth: 5, lineCap: .round, dash: [0.5, 14]))
        }
    }
}

private struct StopCard: View {
    let stop: ChronicleStop
    let chronicle: Chronicle

    private var accent: Color { chronicle.accent.color }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(stop.gotLabel)
                    .font(.title.bold())
                    .foregroundStyle(accent)
                Spacer(minLength: 4)
                if chronicle.showAges, let age = stop.age {
                    Text("Age \(age)")
                        .font(.caption2)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 2)
                        .background(Color.white.opacity(0.1), in: Capsule())
                }
            }
            ConsoleArtView(art: stop.art, name: stop.platformName)
                .frame(height: 92)
            if !stop.badges.isEmpty {
                FlowLayout(spacing: 5) {
                    ForEach(stop.badges, id: \.self) { badge in
                        Text("★ \(badge.label.uppercased())")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundStyle(Color.canvas)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(accent, in: Capsule())
                    }
                }
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(stop.platformName).font(.subheadline.weight(.semibold))
                if let model = stop.model { Text(model).font(.caption).foregroundStyle(Color.fog) }
                if let note = stop.note {
                    Text("\u{201C}\(note)\u{201D}").font(.caption.italic()).foregroundStyle(Color.fog)
                }
            }
            if !stop.games.isEmpty {
                HStack(spacing: 6) {
                    ForEach(stop.games) { game in
                        Poster(url: game.coverUrl, width: 46)
                    }
                }
            }
        }
        .padding(14)
        .containerRelativeFrame(.horizontal, alignment: .leading) { width, _ in width * 0.58 - 12 }
        .background(Color.card.opacity(0.8), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Color.white.opacity(0.1)))
        .shadow(color: .black.opacity(0.4), radius: 12, y: 6)
        .accessibilityElement(children: .combine)
    }
}

// A console photo (transparent PNG) as-is; an IGDB logo on a light plate.
struct ConsoleArtView: View {
    let art: ConsoleArt?
    let name: String

    var body: some View {
        switch art?.kind {
        case .photo:
            AsyncImage(url: art?.src) { image in
                image.resizable().scaledToFit().shadow(color: .black.opacity(0.55), radius: 9, y: 10)
            } placeholder: {
                Color.clear
            }
            .frame(maxWidth: .infinity)
        case .logo:
            AsyncImage(url: art?.src) { image in
                image.resizable().scaledToFit()
            } placeholder: {
                Color.clear
            }
            .padding(10)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.white.opacity(0.9), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        case nil:
            Text(name)
                .font(.footnote)
                .foregroundStyle(Color.fog)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
    }
}

struct ChronicleBackdrop: View {
    let style: ChronicleBackground
    let accent: Color

    var body: some View {
        ZStack {
            Color.canvas
            switch style {
            case .plain:
                EmptyView()
            case .glow:
                GeometryReader { geo in
                    let w = geo.size.width
                    let h = geo.size.height
                    ZStack {
                        glow(at: CGPoint(x: w * 0.1, y: 0), radius: w * 0.8, opacity: 0.2)
                        glow(at: CGPoint(x: w * 0.9, y: h * 0.6), radius: w * 0.8, opacity: 0.13)
                        glow(at: CGPoint(x: w * 0.2, y: h), radius: w * 0.7, opacity: 0.1)
                    }
                }
            case .grid:
                Canvas { context, size in
                    var lines = Path()
                    stride(from: 0, through: size.width, by: 48).forEach { x in
                        lines.move(to: CGPoint(x: x, y: 0))
                        lines.addLine(to: CGPoint(x: x, y: size.height))
                    }
                    stride(from: 0, through: size.height, by: 48).forEach { y in
                        lines.move(to: CGPoint(x: 0, y: y))
                        lines.addLine(to: CGPoint(x: size.width, y: y))
                    }
                    context.stroke(lines, with: .color(accent.opacity(0.12)), lineWidth: 1)
                }
                LinearGradient(colors: [.clear, accent.opacity(0.08)], startPoint: .top, endPoint: .bottom)
            }
        }
    }

    private func glow(at point: CGPoint, radius: CGFloat, opacity: Double) -> some View {
        RadialGradient(colors: [accent.opacity(opacity), .clear], center: .center, startRadius: 0, endRadius: radius / 2)
            .frame(width: radius, height: radius)
            .position(point)
    }
}
