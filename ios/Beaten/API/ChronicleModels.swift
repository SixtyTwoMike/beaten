import SwiftUI

// Mirrors ChronicleView / ChronicleStop / ConsoleOption in
// src/lib/chronicle-core.ts, as src/lib/api-chronicle.ts sends them.

nonisolated struct ConsoleArt: Codable, Hashable, Sendable {
    enum Kind: String, Codable, Sendable { case photo, logo }
    let kind: Kind
    let key: String
    let src: URL
    let width: Double
    let height: Double
}

nonisolated struct ChronicleGame: Codable, Hashable, Identifiable, Sendable {
    let igdbId: Int
    let name: String
    let coverUrl: URL?
    var id: Int { igdbId }
}

nonisolated enum ChronicleBadge: String, Codable, Sendable {
    case firstConsole = "FIRST_CONSOLE"
    case firstHandheld = "FIRST_HANDHELD"
    case firstComputer = "FIRST_COMPUTER"

    var label: String {
        switch self {
        case .firstConsole: "First console"
        case .firstHandheld: "First handheld"
        case .firstComputer: "First computer"
        }
    }
}

nonisolated struct ChronicleStop: Codable, Hashable, Identifiable, Sendable {
    let id: String
    let platformId: Int
    let variant: String?
    let platformName: String
    let model: String?
    let gotAt: PartialDate
    let gotLabel: String
    let year: Int
    let age: Int?
    let ageTyped: Int?
    let note: String?
    let badges: [ChronicleBadge]
    let art: ConsoleArt?
    let games: [ChronicleGame]
}

// The fixed look choices (CHRONICLE_BACKGROUNDS / _PATHS / CARD_ACCENTS).
nonisolated enum ChronicleAccent: String, Codable, CaseIterable, Identifiable, Sendable {
    case mint, gold, sky, pink, white
    var id: String { rawValue }
    @MainActor var color: Color {
        switch self {
        case .mint: Color(hex: 0x00D474)
        case .gold: Color(hex: 0xFFB43A)
        case .sky: Color(hex: 0x38BDF8)
        case .pink: Color(hex: 0xF472B6)
        case .white: Color(hex: 0xF3F6F9)
        }
    }
}

nonisolated enum ChronicleBackground: String, Codable, CaseIterable, Identifiable, Sendable {
    case glow, plain, grid
    var id: String { rawValue }
    var label: String {
        switch self {
        case .glow: "Glow"
        case .plain: "Plain"
        case .grid: "Retro grid"
        }
    }
}

nonisolated enum ChroniclePath: String, Codable, CaseIterable, Identifiable, Sendable {
    case dotted, neon, pixel
    var id: String { rawValue }
    var label: String {
        switch self {
        case .dotted: "Dotted trail"
        case .neon: "Neon"
        case .pixel: "Pixel road"
        }
    }
}

nonisolated struct Chronicle: Codable, Hashable, Sendable {
    let title: String
    let name: String
    let username: String?
    let birthYear: Int?
    let showAges: Bool
    let accent: ChronicleAccent
    let background: ChronicleBackground
    let path: ChroniclePath
    let stops: [ChronicleStop]

    // "4 consoles · 1989–2020"
    var summary: String {
        guard let first = stops.first, let last = stops.last else { return name }
        let span = first.year == last.year ? String(first.year) : "\(first.year)–\(last.year)"
        return "\(name) · \(stops.count) console\(stops.count == 1 ? "" : "s") · \(span)"
    }
}

nonisolated struct ConsoleOption: Codable, Hashable, Identifiable, Sendable {
    let value: String // "<platformId>" or "<platformId>:<variant>"
    let platformId: Int
    let variant: String?
    let name: String
    let search: String
    let thumb: URL?
    let popular: Bool
    let rank: Int
    let art: ConsoleArt?
    var id: String { value }

    func matches(_ query: String) -> Bool {
        query.isEmpty || name.localizedCaseInsensitiveContains(query) || search.localizedCaseInsensitiveContains(query)
    }
}

nonisolated struct ChronicleSettings: Encodable, Sendable {
    var title: String?
    var birthYear: Int?
    var showAges: Bool
    var accent: ChronicleAccent
    var background: ChronicleBackground
    var path: ChroniclePath
}

nonisolated struct ConsoleInput: Encodable, Sendable {
    var platformId: Int
    var variant: String?
    var model: String?
    var gotAt: PartialDate
    var age: Int?
    var note: String?
    var games: [Int]
}
