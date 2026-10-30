import SwiftUI

struct HomeView: View {
    @Environment(AppModel.self) private var model
    let showSearch: () -> Void

    // One "now playing" entry per game, most recently started first.
    private var playing: [PlayLog] {
        var seen = Set<Int>()
        return model.logs
            .filter { $0.status == .playing }
            .sorted { ($0.startedAt?.date ?? $0.createdAt) > ($1.startedAt?.date ?? $1.createdAt) }
            .filter { seen.insert($0.game?.igdbId ?? 0).inserted }
    }

    private var recentlyFinished: [PlayLog] {
        model.logs
            .filter { $0.finishedAt != nil }
            .sorted { ($0.finishedAt!, $0.createdAt) > ($1.finishedAt!, $1.createdAt) }
            .prefix(8)
            .map { $0 }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                if let error = model.loadError { ErrorBanner(message: error) }

                VStack(alignment: .leading, spacing: 6) {
                    Text("Welcome back, \(model.me?.name ?? model.me?.username ?? "player")")
                        .font(.title2.bold())
                    Text("Your log of games playing, beaten, and mastered.")
                        .font(.subheadline)
                        .foregroundStyle(Color.fog)
                }

                if let stats = model.me?.stats { StatsGrid(stats: stats) }

                Button(action: showSearch) {
                    Label("Log a game", systemImage: "plus")
                        .fontWeight(.semibold)
                        .frame(maxWidth: .infinity, minHeight: 30)
                }
                .buttonStyle(.borderedProminent)
                .foregroundStyle(Color.canvas)

                if !playing.isEmpty {
                    Section {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(alignment: .top, spacing: 14) {
                                ForEach(playing) { log in
                                    if let game = log.game {
                                        NavigationLink(value: game) {
                                            VStack(alignment: .leading, spacing: 6) {
                                                Poster(url: game.coverUrl, width: 110)
                                                Text(game.name).font(.footnote.weight(.medium)).lineLimit(2)
                                                if let since = log.startedAt {
                                                    Text("Since \(since.formatted)").font(.caption2).foregroundStyle(Color.fog)
                                                }
                                            }
                                            .frame(width: 110, alignment: .leading)
                                        }
                                        .buttonStyle(.plain)
                                    }
                                }
                            }
                        }
                    } header: {
                        SectionTitle("Now playing")
                    }
                }

                Section {
                    if recentlyFinished.isEmpty {
                        Text("Games you finish show up here.")
                            .font(.subheadline)
                            .foregroundStyle(Color.fog)
                    } else {
                        VStack(spacing: 0) {
                            ForEach(recentlyFinished) { log in
                                LogRow(log: log)
                                if log.id != recentlyFinished.last?.id { Divider().overlay(Color.edge) }
                            }
                        }
                    }
                } header: {
                    SectionTitle("Recently beaten")
                }

                Section {
                    ForEach(Extra.allCases) { extra in
                        NavigationLink { extra.destination } label: { ExtraCard(extra: extra) }
                            .buttonStyle(.plain)
                    }
                } header: {
                    SectionTitle("Extras")
                }
            }
            .padding()
        }
        .background(Color.canvas)
        .refreshable { await model.refresh() }
        .toolbar {
            ToolbarItem(placement: .principal) { Logo(size: 18) }
        }
        .navigationBarTitleDisplayMode(.inline)
        .gameDestinations()
    }
}

private struct StatsGrid: View {
    let stats: Stats

    var body: some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
            tile("Now playing", stats.playing, .sky)
            tile("Games beaten", stats.beaten, .mint)
            tile("Mastered", stats.mastered, .gold)
            tile("Finished in \(String(stats.year))", stats.finishedThisYear, .white)
        }
    }

    private func tile(_ label: String, _ value: Int, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("\(value)").font(.title.bold()).foregroundStyle(color).monospacedDigit()
            Text(label).font(.caption).foregroundStyle(Color.fog)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Color.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

struct SectionTitle: View {
    let text: String
    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text.uppercased())
            .font(.caption.weight(.semibold))
            .tracking(1)
            .foregroundStyle(Color.fog)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// A diary entry: cover, name, status, dates, stars. Opens the game.
struct LogRow: View {
    @Environment(AppModel.self) private var model
    let log: PlayLog

    var body: some View {
        if let game = log.game {
            NavigationLink(value: game) {
                HStack(spacing: 12) {
                    Poster(url: game.coverUrl, width: 46)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(game.name).font(.subheadline.weight(.semibold)).lineLimit(2)
                        HStack(spacing: 6) {
                            StatusBadge(status: log.status)
                            if log.isReplay {
                                Image(systemName: "arrow.counterclockwise").font(.caption2).foregroundStyle(Color.fog)
                                    .accessibilityLabel("Replay")
                            }
                            if let rating = log.rating { Stars(rating: rating, size: 10) }
                        }
                        Text(log.dateLine(platform: model.platformName(log.platformId)))
                            .font(.caption)
                            .foregroundStyle(Color.fog)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 0)
                }
                .padding(.vertical, 8)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
    }
}

extension PlayLog {
    // "Mar 2026 – Apr 2, 2026 · Switch", like logDates() on the web.
    func dateLine(platform: String?) -> String {
        var parts: [String] = []
        switch status {
        case .playing:
            if let startedAt { parts.append("Since \(startedAt.formatted)") }
        case .shelved:
            if let stoppedAt { parts.append("Put down \(stoppedAt.formatted)") }
            if notReturning { parts.append("Not going back") }
        case .beaten, .mastered:
            if let finishedAt {
                parts.append(startedAt.map { "\($0.formatted) – \(finishedAt.formatted)" } ?? finishedAt.formatted)
            } else {
                parts.append("Finished, date unknown")
            }
        }
        if let platform { parts.append(platform) }
        return parts.joined(separator: " · ")
    }
}

extension View {
    // Every tab's stack opens games the same way.
    func gameDestinations() -> some View {
        navigationDestination(for: Game.self) { GameView(game: $0) }
    }
}
