import Foundation

// Mirrors src/lib/api-json.ts and src/lib/api-me.ts on the server.

nonisolated enum PlayStatus: String, Codable, CaseIterable, Identifiable, Sendable {
    case playing = "PLAYING"
    case beaten = "BEATEN"
    case mastered = "MASTERED"
    case shelved = "SHELVED"

    var id: String { rawValue }
    // Finished statuses usually have a finish date, but it may be unknown.
    var isFinished: Bool { self == .beaten || self == .mastered }
}

nonisolated struct Game: Codable, Hashable, Identifiable, Sendable {
    let igdbId: Int
    let name: String
    let coverUrl: URL?
    let artworkUrl: URL?
    let releaseYear: Int?
    let summary: String?
    let platformIds: [Int]

    var id: Int { igdbId }
}

nonisolated struct PlayLog: Codable, Hashable, Identifiable, Sendable {
    let id: String
    let status: PlayStatus
    let platformId: Int?
    let startedAt: PartialDate?
    let finishedAt: PartialDate?
    let stoppedAt: PartialDate?
    let notReturning: Bool
    let isReplay: Bool
    let rating: Int?
    let reviewText: String?
    let containsSpoilers: Bool
    let createdAt: Date
    let updatedAt: Date
    // Present in the diary; absent in a game's own list of entries.
    let game: Game?
}

nonisolated struct Avatar: Codable, Hashable, Sendable {
    let url: URL
    let source: String
    let x: Double
    let y: Double
    let zoom: Double
}

nonisolated struct Stats: Codable, Hashable, Sendable {
    let playing: Int
    let beaten: Int
    let mastered: Int
    let finishedThisYear: Int
    let year: Int
}

nonisolated struct Me: Codable, Hashable, Sendable {
    let id: String
    let email: String
    let username: String?
    let name: String?
    let hasPassword: Bool
    let avatar: Avatar?
    let stats: Stats
}

nonisolated struct Platform: Codable, Hashable, Identifiable, Sendable {
    let id: Int
    let name: String
    let abbreviation: String?
    let generation: Int?
}

nonisolated struct Shelf: Codable, Hashable, Identifiable, Sendable {
    let id: String
    let name: String
    let description: String?
    let games: [Game]
}

nonisolated struct Device: Codable, Hashable, Identifiable, Sendable {
    let id: String
    let name: String?
    let createdAt: Date
    let lastUsedAt: Date
    let current: Bool
}

nonisolated struct GameDetail: Codable, Sendable {
    let game: Game
    let logs: [PlayLog]
    let shelfIds: [String]
}

// Body of POST /logs and PATCH /logs/:id (SaveLogInput in src/lib/logs.ts).
// Nil fields are left out, which the server reads as empty.
nonisolated struct LogInput: Encodable, Sendable {
    var id: String?
    var igdbId: Int
    var status: PlayStatus
    var platformId: Int?
    var startedAt: PartialDate?
    var finishedAt: PartialDate?
    var finishedDateUnknown: Bool
    var stoppedAt: PartialDate?
    var notReturning: Bool
    var isReplay: Bool
    var rating: Int?
    var reviewText: String?
    var containsSpoilers: Bool
    var shelfIds: [String]
    var newShelfName: String?
}

// A date that may be just a month or a year: "2026-03-04", "2026-03" or "2026".
nonisolated struct PartialDate: Codable, Hashable, Sendable, Comparable {
    enum Precision: String, CaseIterable, Identifiable, Sendable {
        case day, month, year
        var id: String { rawValue }
        var label: String {
            switch self {
            case .day: "Exact day"
            case .month: "Month"
            case .year: "Year"
            }
        }
    }

    var year: Int
    var month: Int?
    var day: Int?

    var precision: Precision { day != nil ? .day : month != nil ? .month : .year }

    init(year: Int, month: Int? = nil, day: Int? = nil) {
        self.year = year
        self.month = month
        self.day = month == nil ? nil : day
    }

    // A calendar date cut down to the given precision.
    init(_ date: Date, precision: Precision) {
        let c = Calendar(identifier: .gregorian).dateComponents([.year, .month, .day], from: date)
        self.init(
            year: c.year ?? 2000,
            month: precision == .year ? nil : c.month,
            day: precision == .day ? c.day : nil
        )
    }

    init?(string: String) {
        let parts = string.split(separator: "-").map { Int($0) }
        guard (1...3).contains(parts.count), parts.allSatisfy({ $0 != nil }), let y = parts[0] else { return nil }
        self.init(year: y, month: parts.count > 1 ? parts[1] : nil, day: parts.count > 2 ? parts[2] : nil)
    }

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        guard let parsed = PartialDate(string: raw) else {
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Bad date \(raw)"))
        }
        self = parsed
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        try c.encode(string)
    }

    var string: String {
        var s = String(format: "%04d", year)
        if let month { s += String(format: "-%02d", month) }
        if let day { s += String(format: "-%02d", day) }
        return s
    }

    // The first day of the period, for date pickers and sorting.
    var date: Date {
        Calendar(identifier: .gregorian).date(from: DateComponents(year: year, month: month ?? 1, day: day ?? 1)) ?? .now
    }

    // "Mar 4, 2026", "Mar 2026" or "2026", like formatPartialDate on the web.
    var formatted: String {
        switch precision {
        case .day: date.formatted(.dateTime.month(.abbreviated).day().year())
        case .month: date.formatted(.dateTime.month(.abbreviated).year())
        case .year: String(year)
        }
    }

    static func < (a: PartialDate, b: PartialDate) -> Bool {
        (a.year, a.month ?? 0, a.day ?? 0) < (b.year, b.month ?? 0, b.day ?? 0)
    }
}
