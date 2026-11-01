import SwiftUI

// Console Chronicles as an image, in the share card's style, drawn on the
// phone (ImageRenderer). Mirrors the web's lib/cards/chronicle-card-markup.tsx:
// same formats, picks and tile maths; change one, change the other.

enum CardFormat: String, CaseIterable, Identifiable {
    case square, story, wide
    var id: String { rawValue }
    var size: CGSize {
        switch self {
        case .square: CGSize(width: 1080, height: 1080)
        case .story: CGSize(width: 1080, height: 1920)
        case .wide: CGSize(width: 1200, height: 630)
        }
    }
    var label: String {
        switch self {
        case .square: "Square"
        case .story: "Story"
        case .wide: "Wide"
        }
    }
}

enum ChroniclePick: String, CaseIterable, Identifiable {
    case latest, first, all
    var id: String { rawValue }
    var label: String {
        switch self {
        case .latest: "Latest 4"
        case .first: "First 4"
        case .all: "All of them"
        }
    }
}

struct ChronicleCardOptions: Equatable {
    var format: CardFormat = .square
    var pick: ChroniclePick = .all
    var accent: ChronicleAccent?
    var games = true
    var ages = true
}

struct ChronicleCardView: View {
    let chronicle: Chronicle
    let options: ChronicleCardOptions
    let images: VideoImages

    private var size: CGSize { options.format.size }
    private var story: Bool { options.format == .story }
    private var wide: Bool { options.format == .wide }
    private var accent: Color { (options.accent ?? chronicle.accent).color }
    private var pad: CGFloat { wide ? 48 : 72 }
    private var gap: CGFloat { wide ? 16 : 24 }

    // The most tiles "all" fits in each format; past that, "+N more".
    private var allFits: (columns: Int, max: Int) {
        switch options.format {
        case .square: (3, 9)
        case .story: (3, 12)
        case .wide: (6, 6)
        }
    }

    private var picked: (stops: [ChronicleStop], more: Int) {
        let stops = chronicle.stops
        switch options.pick {
        case .first: return (Array(stops.prefix(4)), 0)
        case .latest: return (Array(stops.suffix(4)), 0)
        case .all:
            guard stops.count > allFits.max else { return (stops, 0) }
            let keep = allFits.max - 1
            return (Array(stops.prefix(1)) + Array(stops.suffix(keep - 1)), stops.count - keep)
        }
    }

    private var grid: (columns: Int, tile: CGSize) {
        let (stops, more) = picked
        let four = options.pick != .all
        let columns = four ? (wide ? 4 : 2) : allFits.columns
        let rows = max(1, Int(ceil(Double(stops.count + (more > 0 ? 1 : 0)) / Double(columns))))
        let chrome: CGFloat = wide ? 230 : story ? 520 : 330
        let w = floor((size.width - 2 * pad - CGFloat(columns - 1) * gap) / CGFloat(columns))
        let h = min(floor((size.height - 2 * pad - chrome - CGFloat(rows - 1) * gap) / CGFloat(rows)), (w * (options.games ? 1.75 : 1.3)).rounded())
        return (columns, CGSize(width: w, height: h))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: wide ? 18 : story ? 48 : 30) {
                HStack(alignment: .center) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(chronicle.name).font(.system(size: wide ? 28 : story ? 44 : 36, weight: .bold)).foregroundStyle(.white)
                        if let username = chronicle.username {
                            Text("@\(username)").font(.system(size: wide ? 18 : story ? 26 : 22)).foregroundStyle(Color.fog)
                        }
                    }
                    Spacer()
                    if !story { stats }
                }
                if story { stats }
                HStack(spacing: 16) {
                    RoundedRectangle(cornerRadius: 4).fill(accent).frame(width: 10, height: wide ? 30 : story ? 52 : 42)
                    Text(chronicle.title).font(.system(size: wide ? 34 : story ? 60 : 50, weight: .bold)).foregroundStyle(.white).lineLimit(1)
                }
            }
            Spacer(minLength: 0)
            tiles
            Spacer(minLength: 0)
            HStack {
                Text(chronicle.username.map { "beaten.games/\($0)/chronicles" } ?? "beaten.games/chronicles")
                    .font(.system(size: wide ? 18 : story ? 28 : 22))
                    .foregroundStyle(Color.fog)
                Spacer()
                Text("BEATEN").font(.custom("Futura-Medium", size: wide ? 24 : story ? 40 : 32)).tracking(5).foregroundStyle(.white)
            }
        }
        .padding(pad)
        .frame(width: size.width, height: size.height)
        .background {
            ZStack {
                Color.canvas
                RadialGradient(colors: [accent.opacity(0.25), .clear], center: UnitPoint(x: 0.15, y: 0), startRadius: 0, endRadius: size.width * 0.75)
                RadialGradient(colors: [accent.opacity(0.15), .clear], center: .bottomTrailing, startRadius: 0, endRadius: size.width * 0.6)
            }
        }
    }

    private var stats: some View {
        HStack(spacing: 36) {
            stat(String(chronicle.stops.count), chronicle.stops.count == 1 ? "CONSOLE" : "CONSOLES")
            if let first = chronicle.stops.first { stat(String(first.year), "SINCE") }
        }
    }

    private func stat(_ value: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value).font(.system(size: wide ? 30 : story ? 54 : 44, weight: .bold)).foregroundStyle(accent)
            Text(label).font(.system(size: wide ? 16 : story ? 24 : 20)).tracking(2).foregroundStyle(Color.fog)
        }
    }

    private var tiles: some View {
        let (stops, more) = picked
        let (columns, tile) = grid
        let compact = tile.height < 260 || tile.width < 200
        return LazyVGrid(
            columns: Array(repeating: GridItem(.fixed(tile.width), spacing: gap), count: columns),
            alignment: .leading,
            spacing: gap
        ) {
            ForEach(stops) { ChronicleTile(stop: $0, size: tile, compact: compact, accent: accent, options: options, chronicle: chronicle, images: images) }
            if more > 0 {
                RoundedRectangle(cornerRadius: 20)
                    .strokeBorder(accent, style: StrokeStyle(lineWidth: 2, dash: [8, 6]))
                    .frame(width: tile.width, height: tile.height)
                    .overlay { Text("+\(more) more").font(.system(size: compact ? 28 : 36, weight: .bold)).foregroundStyle(accent) }
            }
        }
        .frame(maxWidth: .infinity, alignment: story && options.pick != .all ? .center : .leading)
    }
}

private struct ChronicleTile: View {
    let stop: ChronicleStop
    let size: CGSize
    let compact: Bool
    let accent: Color
    let options: ChronicleCardOptions
    let chronicle: Chronicle
    let images: VideoImages

    var body: some View {
        let padding: CGFloat = compact ? 14 : 18
        let spacing: CGFloat = compact ? 6 : 10
        let nameSize: CGFloat = compact ? 20 : 26
        let yearSize: CGFloat = compact ? 16 : 20
        let inner = size.height - 2 * padding
        let text = nameSize * 1.2 * 2 + yearSize * 1.3 + spacing * 2
        let photoH = (inner * (options.games && !compact ? 0.42 : 0.6)).rounded()
        let coverW = floor(min((inner - photoH - text - spacing) * 264 / 374, (size.width - 2 * padding - 16) / 3))
        let covers = stop.games.prefix(3).compactMap { images[VideoImages.bigCover($0.coverUrl)] }
        let showGames = options.games && !compact && coverW >= 44 && !covers.isEmpty
        let age = options.ages && chronicle.showAges ? stop.age.map { " · age \($0)" } ?? "" : ""

        VStack(alignment: .leading, spacing: spacing) {
            Group {
                if let art = images[stop.art?.src] {
                    Image(uiImage: art).resizable().scaledToFit()
                } else {
                    RoundedRectangle(cornerRadius: 14)
                        .fill(LinearGradient(colors: [Color(hex: 0x2B3B55), Color(hex: 0x141B26)], startPoint: .topLeading, endPoint: .bottomTrailing))
                        .frame(width: (size.width - 2 * padding) * 0.6, height: photoH * 0.7)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: photoH)
            .frame(height: photoH)
            Text(stop.model.map { "\(stop.platformName) \($0)" } ?? stop.platformName)
                .font(.system(size: nameSize, weight: .bold))
                .foregroundStyle(.white)
                .lineLimit(2)
            Text(stop.gotLabel + age).font(.system(size: yearSize, weight: .semibold)).foregroundStyle(accent)
            if showGames {
                Spacer(minLength: 0)
                HStack(spacing: 8) {
                    ForEach(Array(covers.enumerated()), id: \.offset) { _, cover in
                        Image(uiImage: cover).resizable().scaledToFill()
                            .frame(width: coverW, height: (coverW * 374 / 264).rounded())
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                            .shadow(color: .black.opacity(0.55), radius: 10, y: 10)
                    }
                }
            }
        }
        .padding(padding)
        .frame(width: size.width, height: size.height, alignment: .topLeading)
        .background(Color(hex: 0x161C22).opacity(0.92), in: RoundedRectangle(cornerRadius: 20))
        .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(.white.opacity(0.08)))
    }
}

// Pick options, preview, and share the PNG.
struct ChronicleCardSheet: View {
    @Environment(\.dismiss) private var dismiss
    let chronicle: Chronicle

    @State private var options = ChronicleCardOptions()
    @State private var images: VideoImages?
    @State private var rendered: UIImage?
    @State private var file: URL?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    Group {
                        if let rendered {
                            Image(uiImage: rendered).resizable().scaledToFit()
                        } else {
                            Color.card.overlay { ProgressView() }.aspectRatio(options.format.size, contentMode: .fit)
                        }
                    }
                    .frame(maxHeight: 420)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .accessibilityLabel("Preview of your Console Chronicles image")

                    Picker("Format", selection: $options.format) {
                        ForEach(CardFormat.allCases) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    Picker("Consoles", selection: $options.pick) {
                        ForEach(ChroniclePick.allCases) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    HStack(spacing: 12) {
                        ForEach(ChronicleAccent.allCases) { a in
                            Button { options.accent = a } label: {
                                Circle().fill(a.color).frame(width: 28, height: 28)
                                    .overlay { if (options.accent ?? chronicle.accent) == a { Circle().strokeBorder(.white, lineWidth: 3) } }
                            }
                            .accessibilityLabel(a.rawValue)
                        }
                        Spacer()
                    }
                    Toggle("Games", isOn: $options.games)
                    if chronicle.showAges { Toggle("Ages", isOn: $options.ages) }

                    if let file {
                        ShareLink(item: file, preview: SharePreview("My Console Chronicles", image: Image(uiImage: rendered ?? UIImage()))) {
                            Label("Share image", systemImage: "square.and.arrow.up")
                                .fontWeight(.semibold)
                                .frame(maxWidth: .infinity, minHeight: 30)
                        }
                        .buttonStyle(.borderedProminent)
                        .foregroundStyle(Color.canvas)
                    }
                }
                .padding()
            }
            .canvasBackground()
            .navigationTitle("Image")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Close", role: .close) { dismiss() } }
            }
            .task { images = await VideoImages.load(ChronicleVideo.imageURLs(chronicle)) }
            .task(id: RenderKey(options: options, loaded: images != nil)) { render() }
        }
    }

    private struct RenderKey: Equatable {
        let options: ChronicleCardOptions
        let loaded: Bool
    }

    private func render() {
        guard let images else { return }
        let renderer = ImageRenderer(content: ChronicleCardView(chronicle: chronicle, options: options, images: images))
        renderer.scale = 1
        renderer.proposedSize = ProposedViewSize(options.format.size)
        guard let image = renderer.uiImage, let data = image.pngData() else { return }
        rendered = image
        let url = FileManager.default.temporaryDirectory.appending(path: "console-chronicles-\(options.format.rawValue).png")
        try? data.write(to: url)
        file = url
    }
}
