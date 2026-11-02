import Foundation

// The Pull List (GET /api/v1/pull-list): games you're interested in, in your
// order. Sorting and grouping follow the web's rules (src/lib/pull-sort.ts).

nonisolated struct PullEntry: Codable, Hashable, Identifiable, Sendable {
    let igdbId: Int
    let name: String
    let coverUrl: URL?
    // YYYY-MM-DD, or nil when there's no date yet (TBA)
    let releaseDate: String?
    let genres: [String]
    let platformIds: [Int]
    // "MANUAL" | "STEAM"
    let source: String
    let addedAt: Date

    var id: Int { igdbId }
    var fromSteam: Bool { source == "STEAM" }

    enum Release { case out, upcoming, tba }

    func release(today: String = PullEntry.today()) -> Release {
        guard let releaseDate else { return .tba }
        return releaseDate <= today ? .out : .upcoming
    }

    // "19 Nov 2026", in the device's style.
    var releaseLabel: String? {
        guard let releaseDate, let date = PullEntry.dayFormat.date(from: releaseDate) else { return nil }
        return date.formatted(.dateTime.day().month(.abbreviated).year())
    }

    // A Game for navigation, so a row can open the game page.
    var game: Game {
        Game(igdbId: igdbId, name: name, coverUrl: coverUrl, artworkUrl: nil, releaseYear: releaseDate.flatMap { Int($0.prefix(4)) }, summary: nil, platformIds: platformIds)
    }

    static func today() -> String { dayFormat.string(from: .now) }

    private static let dayFormat: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()
}

nonisolated struct PullList: Codable, Sendable {
    var items: [PullEntry]
    var steamLinked: Bool

    static let empty = PullList(items: [], steamLinked: false)
}

nonisolated struct WishlistResult: Decodable, Sendable {
    let added: Int
    let unmatched: Int
    let empty: Bool
    let items: [PullEntry]
    let steamLinked: Bool
}

enum PullSort: String, CaseIterable, Identifiable {
    case order, release, genre, added, name
    var id: String { rawValue }
    var label: String {
        switch self {
        case .order: "My order"
        case .release: "Release date"
        case .genre: "Genre"
        case .added: "Recently added"
        case .name: "Name"
        }
    }
}

struct PullGroup: Identifiable {
    let title: String?
    let entries: [PullEntry]
    var id: String { title ?? "all" }
}

extension [PullEntry] {
    static let noGenre = "Other"

    // Release date: soonest upcoming first, then TBA, then games already out
    // (newest first). Genre: one section per genre (a game sits under its
    // first, IGDB's main one), in your order.
    func grouped(by sort: PullSort, genre: String?) -> [PullGroup] {
        let list = genre.map { g in filter { $0.genres.contains(g) } } ?? self
        switch sort {
        case .release:
            let today = PullEntry.today()
            let upcoming = list.filter { $0.release(today: today) == .upcoming }.sorted { $0.releaseDate! < $1.releaseDate! }
            let tba = list.filter { $0.releaseDate == nil }
            let out = list.filter { $0.release(today: today) == .out }.sorted { $0.releaseDate! > $1.releaseDate! }
            return [PullGroup(title: "Coming up", entries: upcoming), PullGroup(title: "No date yet", entries: tba), PullGroup(title: "Out now", entries: out)]
                .filter { !$0.entries.isEmpty }
        case .genre:
            var groups: [String: [PullEntry]] = [:]
            for e in list { groups[genre ?? e.genres.first ?? Self.noGenre, default: []].append(e) }
            return groups.keys
                .sorted { $0 == Self.noGenre ? false : $1 == Self.noGenre ? true : $0.localizedCompare($1) == .orderedAscending }
                .map { PullGroup(title: $0, entries: groups[$0]!) }
        case .added:
            return [PullGroup(title: nil, entries: list.sorted { $0.addedAt > $1.addedAt })]
        case .name:
            return [PullGroup(title: nil, entries: list.sorted { $0.name.localizedCompare($1.name) == .orderedAscending })]
        case .order:
            return [PullGroup(title: nil, entries: list)]
        }
    }

    // Every genre on the list, most common first.
    var genres: [String] {
        var counts: [String: Int] = [:]
        for e in self { for g in e.genres { counts[g, default: 0] += 1 } }
        return counts.sorted { $0.value != $1.value ? $0.value > $1.value : $0.key < $1.key }.map(\.key)
    }
}
