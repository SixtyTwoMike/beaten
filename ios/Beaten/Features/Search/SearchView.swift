import SwiftUI

struct SearchView: View {
    @Environment(AppModel.self) private var model
    @State private var query = ""
    @State private var platformId: Int?
    @State private var results: [Game] = []
    @State private var searching = false
    @State private var error: String?
    @State private var logging: LogSheet.Target?

    var body: some View {
        List {
            if let error {
                ErrorBanner(message: error).listRowBackground(Color.clear)
            }
            ForEach(results) { game in
                SearchResultRow(game: game) { status in
                    logging = .init(game: game, status: status)
                }
                .listRowBackground(Color.canvas)
            }
        }
        .listStyle(.plain)
        .canvasBackground()
        .overlay {
            if searching && results.isEmpty {
                ProgressView()
            } else if query.count < 2 {
                ContentUnavailableView("Find a game", systemImage: "magnifyingglass", description: Text("Search the IGDB catalogue to log what you're playing or have finished."))
            } else if results.isEmpty && error == nil && !searching {
                ContentUnavailableView.search(text: query)
            }
        }
        .navigationTitle("Search")
        .searchable(text: $query, prompt: "Games")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) { platformMenu }
        }
        // Debounced: a new keystroke cancels the pending search.
        .task(id: "\(query)|\(platformId ?? 0)") {
            let q = query.trimmingCharacters(in: .whitespaces)
            guard q.count >= 2 else {
                results = []
                error = nil
                return
            }
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            searching = true
            defer { searching = false }
            do {
                results = try await model.search(q, platformId: platformId)
                error = nil
            } catch is CancellationError {
            } catch {
                self.error = error.localizedDescription
            }
        }
        .sheet(item: $logging) { LogSheet(target: $0) }
        .gameDestinations()
    }

    private var platformMenu: some View {
        Menu {
            Picker("Platform", selection: $platformId) {
                Text("All platforms").tag(Int?.none)
                ForEach(model.platforms) { Text($0.name).tag(Int?.some($0.id)) }
            }
        } label: {
            Label(model.platformName(platformId) ?? "All platforms",
                  systemImage: platformId == nil ? "line.3.horizontal.decrease.circle" : "line.3.horizontal.decrease.circle.fill")
        }
    }
}

private struct SearchResultRow: View {
    @Environment(AppModel.self) private var model
    let game: Game
    let log: (PlayStatus) -> Void

    // Newest entry the user already has for this game, if any.
    private var latest: PlayLog? {
        model.logs.filter { $0.game?.igdbId == game.igdbId }.max { $0.updatedAt < $1.updatedAt }
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            NavigationLink(value: game) {
                HStack(alignment: .top, spacing: 12) {
                    Poster(url: game.coverUrl, width: 56)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(game.name).font(.subheadline.weight(.semibold)).lineLimit(2)
                        if let year = game.releaseYear {
                            Text(String(year)).font(.caption).foregroundStyle(Color.fog)
                        }
                        if let latest { StatusBadge(status: latest.status) }
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            Menu {
                ForEach(PlayStatus.allCases) { status in
                    Button { log(status) } label: { Label(status.label, systemImage: status.symbol) }
                }
            } label: {
                Image(systemName: "plus.circle.fill")
                    .font(.title2)
                    .symbolRenderingMode(.hierarchical)
                    .foregroundStyle(Color.mint)
                    .padding(.top, 4)
            }
            .accessibilityLabel("Log \(game.name)")
        }
        .padding(.vertical, 4)
    }
}
