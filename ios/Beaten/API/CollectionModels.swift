import Foundation

// The physical collection (GET /api/v1/collection): games you own, separate
// from the diary. Options and labels follow src/lib/collection-shared.ts.

nonisolated struct CollectionEntry: Codable, Hashable, Identifiable, Sendable {
    let id: String
    let igdbId: Int
    let name: String
    let coverUrl: URL?
    let releaseYear: Int?
    let platformIds: [Int]
    let platformId: Int
    let platformName: String
    let region: String?
    let completeness: String?
    let edition: String?
    let acquiredAt: PartialDate?
    // Minor units (pence, cents; yen as is) in `currency`. Private.
    let pricePaid: Int?
    let currency: String?
    let notes: String?
    let createdAt: String

    var game: Game {
        Game(igdbId: igdbId, name: name, coverUrl: coverUrl, artworkUrl: nil, releaseYear: releaseYear, summary: nil, platformIds: platformIds)
    }

    // "PAL · Boxed (CIB) · Collector's Edition"
    var details: String {
        [Region(rawValue: region ?? "")?.label, Completeness(rawValue: completeness ?? "")?.label, edition]
            .compactMap { $0 }
            .joined(separator: " · ")
    }

    var priceLabel: String? {
        guard let pricePaid else { return nil }
        let c = Currency(rawValue: currency ?? "") ?? .gbp
        return c.symbol + c.text(pricePaid)
    }
}

nonisolated struct CollectionList: Codable, Sendable {
    var enabled: Bool
    var `public`: Bool
    var items: [CollectionEntry]

    static let empty = CollectionList(enabled: false, public: false, items: [])
}

nonisolated struct CollectionSettings: Codable, Sendable {
    let enabled: Bool
    let `public`: Bool
}

// Body of POST /collection and PATCH /collection/:id. Prices go as typed
// ("12.50"); the server turns them into minor units.
nonisolated struct CollectionInput: Encodable, Sendable {
    var igdbId: Int?
    var platformId: Int
    var region: String
    var completeness: String
    var edition: String
    var acquiredAt: PartialDate?
    var pricePaid: String
    var currency: String
    var notes: String
}

nonisolated enum Region: String, CaseIterable, Identifiable, Sendable {
    case pal = "PAL", ntscU = "NTSC_U", ntscJ = "NTSC_J", other = "OTHER"
    var id: String { rawValue }
    var label: String {
        switch self {
        case .pal: "PAL"
        case .ntscU: "NTSC-U"
        case .ntscJ: "NTSC-J"
        case .other: "Other region"
        }
    }
}

nonisolated enum Completeness: String, CaseIterable, Identifiable, Sendable {
    case loose = "LOOSE", cib = "CIB", sealed = "SEALED", boxOnly = "BOX_ONLY"
    var id: String { rawValue }
    var label: String {
        switch self {
        case .loose: "Loose"
        case .cib: "Boxed (CIB)"
        case .sealed: "Sealed"
        case .boxOnly: "Box only"
        }
    }
}

nonisolated enum Currency: String, CaseIterable, Identifiable, Sendable {
    case gbp = "GBP", usd = "USD", eur = "EUR", jpy = "JPY", cad = "CAD", aud = "AUD"
    var id: String { rawValue }
    var symbol: String {
        switch self {
        case .gbp: "£"
        case .usd: "$"
        case .eur: "€"
        case .jpy: "¥"
        case .cad: "CA$"
        case .aud: "A$"
        }
    }
    var digits: Int { self == .jpy ? 0 : 2 }

    // 1250 → "12.50"
    func text(_ minor: Int) -> String {
        digits == 0 ? String(minor) : String(format: "%d.%02d", minor / 100, minor % 100)
    }

    // The device's currency when it's one we offer, else pounds.
    static var preferred: Currency {
        Currency(rawValue: Locale.current.currency?.identifier ?? "") ?? .gbp
    }
}

nonisolated enum CollectionSort: String, CaseIterable, Identifiable, Sendable {
    case platform, title, added
    var id: String { rawValue }
    var label: String {
        switch self {
        case .platform: "By platform"
        case .title: "A–Z"
        case .added: "Recently added"
        }
    }
}

extension [CollectionEntry] {
    // By platform (A–Z, titles A–Z within), or one list by title or newest.
    func grouped(by sort: CollectionSort) -> [(label: String, entries: [CollectionEntry])] {
        let byTitle: (CollectionEntry, CollectionEntry) -> Bool = { $0.name.localizedCompare($1.name) == .orderedAscending }
        switch sort {
        case .title: return [("", sorted(by: byTitle))]
        case .added: return [("", sorted { $0.createdAt > $1.createdAt })]
        case .platform:
            return Dictionary(grouping: self, by: \.platformName)
                .sorted { $0.key.localizedCompare($1.key) == .orderedAscending }
                .map { ($0.key, $0.value.sorted(by: byTitle)) }
        }
    }
}
