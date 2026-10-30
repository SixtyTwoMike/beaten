import SwiftUI

// The web's share-card builder (components/ShareCardBuilder.tsx): fixed
// options, previewed as the PNG the server renders at /<username>/card, so
// app and web cards are identical. Sharing downloads the PNG and hands the
// file to the share sheet (Messages, Instagram, Save Image…).
struct ShareCardsView: View {
    @Environment(AppModel.self) private var app
    @State private var options = CardOptions()
    @State private var previewURL: URL?
    @State private var file: URL?
    @State private var preparing = false
    @State private var error: String?

    var body: some View {
        if let username = app.me?.username {
            builder(username)
        } else {
            ContentUnavailableView(
                "Choose a username first",
                systemImage: "person.crop.square",
                description: Text("Share cards live at your profile link. Pick a username in Settings on beaten.games.")
            )
            .canvasBackground()
            .navigationTitle("Share cards")
        }
    }

    private func builder(_ username: String) -> some View {
        Form {
            Section {
                CardPreview(url: previewURL, format: options.format)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
            }

            Section {
                if let file {
                    ShareLink(item: file, preview: SharePreview("Beaten share card", image: Image(systemName: "photo"))) {
                        Label("Share card", systemImage: "square.and.arrow.up")
                            .fontWeight(.semibold)
                            .frame(maxWidth: .infinity)
                    }
                } else {
                    Button {
                        Task { await prepare(username) }
                    } label: {
                        HStack {
                            Label("Get card to share", systemImage: "arrow.down.circle")
                                .fontWeight(.semibold)
                            if preparing { Spacer(); ProgressView() }
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .disabled(preparing)
                }
                if let error { ErrorBanner(message: error).listRowBackground(Color.clear) }
            }

            Section("Size") {
                Picker("Size", selection: $options.format) {
                    ForEach(CardOptions.Format.allCases) { Text($0.label).tag($0) }
                }
                .pickerStyle(.segmented)
            }

            Section("Games") {
                Picker("Games", selection: Binding(
                    get: { options.source },
                    set: { options.source = $0; options.heading = $0.headings[0] }
                )) {
                    ForEach(CardOptions.Source.allCases) { Text($0.label).tag($0) }
                }
                .pickerStyle(.segmented)
                Picker("Heading", selection: $options.heading) {
                    ForEach(options.source.headings) { Text($0.label).tag($0) }
                }
            }

            Section("Look") {
                HStack(spacing: 14) {
                    ForEach(ChronicleAccent.allCases) { accent in
                        Button { options.accent = accent } label: {
                            Circle()
                                .fill(accent.color)
                                .frame(width: 30, height: 30)
                                .overlay {
                                    if options.accent == accent {
                                        Circle().strokeBorder(Color.white, lineWidth: 3).padding(-5)
                                    }
                                }
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(accent.rawValue.capitalized)
                        .accessibilityAddTraits(options.accent == accent ? .isSelected : [])
                    }
                }
                .padding(.vertical, 4)
                Toggle("Game artwork behind", isOn: $options.artBackground)
            }

            Section("Show") {
                Toggle("Ratings", isOn: $options.ratings)
                Toggle("Dates", isOn: $options.dates)
                Toggle("Picture", isOn: $options.avatar)
                Toggle("Stats", isOn: $options.stats)
            }
        }
        .canvasBackground()
        .navigationTitle("Share cards")
        .navigationBarTitleDisplayMode(.inline)
        // Debounced like the web, so flicking through options doesn't ask
        // the server for a card per tap.
        .task(id: options) {
            file = nil
            error = nil
            try? await Task.sleep(for: .milliseconds(400))
            guard !Task.isCancelled else { return }
            previewURL = options.url(username: username)
        }
    }

    private func prepare(_ username: String) async {
        preparing = true
        defer { preparing = false }
        do {
            let (data, response) = try await URLSession.shared.data(from: options.url(username: username))
            guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw APIError.offline }
            let url = FileManager.default.temporaryDirectory.appending(path: "beaten-\(username)-\(options.format.rawValue).png")
            try data.write(to: url, options: .atomic)
            file = url
        } catch {
            self.error = "Couldn't get the card. Check your connection and try again."
        }
    }
}

private struct CardPreview: View {
    let url: URL?
    let format: CardOptions.Format

    var body: some View {
        AsyncImage(url: url, transaction: Transaction(animation: .easeOut(duration: 0.2))) { phase in
            switch phase {
            case .success(let image):
                image.resizable().scaledToFit()
            case .failure:
                placeholder.overlay { Text("Couldn't load the preview").font(.footnote).foregroundStyle(Color.fog) }
            default:
                placeholder.overlay { ProgressView() }
            }
        }
        .frame(maxWidth: format == .story ? 240 : .infinity)
        .aspectRatio(format.aspect, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .frame(maxWidth: .infinity)
        .accessibilityLabel("Preview of your share card")
    }

    private var placeholder: some View {
        Rectangle().fill(Color.card)
    }
}

// Mirrors lib/share-card.ts: every option is a fixed choice, and the query
// only carries non-default values, so equal cards share a URL (and the
// server's cache).
struct CardOptions: Hashable {
    enum Format: String, CaseIterable, Identifiable {
        case square, story, wide
        var id: String { rawValue }
        var label: String {
            switch self {
            case .square: "Square"
            case .story: "Story"
            case .wide: "Link"
            }
        }
        var aspect: CGFloat {
            switch self {
            case .square: 1
            case .story: 1080.0 / 1920
            case .wide: 1200.0 / 630
            }
        }
    }

    enum Source: String, CaseIterable, Identifiable {
        case beaten, played
        var id: String { rawValue }
        var label: String { self == .beaten ? "Last 4 beaten" : "Last 4 played" }
        var headings: [Heading] { self == .beaten ? [.last4, .recent, .latest] : [.played4, .playedRecent, .playing] }
    }

    enum Heading: String, CaseIterable, Identifiable {
        case last4, recent, latest, played4, playedRecent, playing
        var id: String { rawValue }
        var label: String {
            switch self {
            case .last4: "My last 4 beaten"
            case .recent: "Recently beaten"
            case .latest: "Latest conquests"
            case .played4: "My last 4 played"
            case .playedRecent: "Recently played"
            case .playing: "What I've been playing"
            }
        }
    }

    var source: Source = .beaten
    var format: Format = .square
    var heading: Heading = .last4
    var accent: ChronicleAccent = .mint
    var artBackground = true
    var ratings = true
    var dates = true
    var avatar = true
    var stats = true

    func url(username: String) -> URL {
        let d = CardOptions()
        var q: [URLQueryItem] = []
        if source != d.source { q.append(.init(name: "games", value: source.rawValue)) }
        if format != d.format { q.append(.init(name: "format", value: format.rawValue)) }
        if heading != source.headings[0] { q.append(.init(name: "heading", value: heading.rawValue)) }
        if accent != d.accent { q.append(.init(name: "accent", value: accent.rawValue)) }
        if artBackground != d.artBackground { q.append(.init(name: "bg", value: artBackground ? "art" : "plain")) }
        for (name, on, def) in [("ratings", ratings, d.ratings), ("dates", dates, d.dates), ("avatar", avatar, d.avatar), ("stats", stats, d.stats)] where on != def {
            q.append(.init(name: name, value: on ? "1" : "0"))
        }
        var c = URLComponents(url: APIClient.baseURL.appending(path: "\(username)/card"), resolvingAgainstBaseURL: false)!
        c.queryItems = q.isEmpty ? nil : q
        return c.url!
    }
}
