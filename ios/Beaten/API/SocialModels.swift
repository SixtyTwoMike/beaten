import Foundation

// Mirrors src/lib/api-social.ts and src/lib/reactions.ts on the server:
// feeds, people, profiles, reactions and comments.

nonisolated struct Person: Codable, Hashable, Sendable {
    let username: String?
    let name: String?
    let avatar: Avatar?
    let imageUrl: URL?

    var display: String { name ?? username.map { "@\($0)" } ?? "Someone" }
}

nonisolated struct MySocial: Codable, Hashable, Sendable {
    let followers: Int
    let following: Int
    let newFollowers: Int
    let unreadNotifications: Int?
}

nonisolated struct ReviewSocial: Codable, Hashable, Sendable {
    nonisolated struct Reaction: Codable, Hashable, Sendable {
        let kind: String
        let count: Int
        let mine: Bool

        var emoji: String { ReviewSocial.emoji[kind] ?? "👍" }
        var label: String { ReviewSocial.labels[kind] ?? kind }
    }

    var reactions: [Reaction]
    var commentCount: Int

    static let emoji = ["heart": "❤️", "fire": "🔥", "laugh": "😂", "wow": "😮", "gg": "🏆"]
    static let labels = ["heart": "Love", "fire": "Fire", "laugh": "Funny", "wow": "Wow", "gg": "GG"]

    // As the server will: add the reaction, or take it away.
    func toggled(_ kind: String) -> ReviewSocial {
        var next = self
        next.reactions = reactions.map {
            $0.kind == kind ? Reaction(kind: kind, count: $0.count + ($0.mine ? -1 : 1), mine: !$0.mine) : $0
        }
        return next
    }
}

// An activity card: one diary entry ("beat and reviewed Hades II"), or a
// day's worth of older games added at once (backfill).
nonisolated struct FeedCard: Decodable, Identifiable, Sendable {
    enum Kind: String, Decodable, Sendable { case entry, backfill }

    nonisolated struct Log: Decodable, Sendable {
        let status: PlayStatus
        let rating: Int?
        let reviewText: String?
        let containsSpoilers: Bool
        let finishedAt: PartialDate?
        let isReplay: Bool
        let notReturning: Bool
    }

    let kind: Kind
    let key: String
    let actor: Person
    let at: Date
    // Entries
    let logId: String?
    let game: Game?
    let verb: String?
    let reviewed: Bool?
    let log: Log?
    // Reviews only.
    var social: ReviewSocial?
    // Backfill
    let games: [Game]?

    var id: String { key }
}

nonisolated struct FeedPage: Decodable, Sendable {
    let cards: [FeedCard]
    let next: String?
    let followsAnyone: Bool
}

nonisolated struct Comment: Decodable, Identifiable, Hashable, Sendable {
    let id: String
    let body: String
    let createdAt: Date
    let author: Person
    let canDelete: Bool
}

nonisolated struct Profile: Decodable, Sendable {
    nonisolated struct Counts: Decodable, Sendable {
        let followers: Int
        let following: Int
    }

    nonisolated struct Relation: Decodable, Sendable {
        let isYou: Bool
        let following: Bool
        let blocked: Bool
        let canFollow: Bool
    }

    let user: Person
    let memberSince: Date
    let instagram: String?
    let bluesky: String?
    let counts: Counts
    let relation: Relation
    let stats: Stats
    let playing: [Game]
    let finished: [PlayLog]
    let finishedTotal: Int
    var reviews: [ReviewEntry]
}

// A diary entry with a review, and its reactions and comment count (nil
// when they're off: a block, or an author without a username).
nonisolated struct ReviewEntry: Decodable, Identifiable, Sendable {
    let log: PlayLog
    var social: ReviewSocial?
    var id: String { log.id }

    private enum CodingKeys: String, CodingKey { case social }

    init(from decoder: Decoder) throws {
        log = try PlayLog(from: decoder)
        social = try decoder.container(keyedBy: CodingKeys.self).decodeIfPresent(ReviewSocial.self, forKey: .social)
    }
}

// GET /reviews/:id — the review on its own (notifications open this).
nonisolated struct ReviewDetail: Decodable, Sendable {
    let log: PlayLog
    let author: Person
    var social: ReviewSocial
    let isYours: Bool
}

nonisolated struct AppNotification: Decodable, Identifiable, Sendable {
    nonisolated struct GameRef: Decodable, Sendable {
        let igdbId: Int
        let name: String
        let coverUrl: URL?
    }

    let id: String
    let type: String
    let actor: Person
    let reaction: String?
    let comment: String?
    let text: String
    let logId: String
    let game: GameRef
    let createdAt: Date
    let read: Bool
}

nonisolated struct NotificationSettings: Codable, Sendable {
    enum Frequency: String, Codable, CaseIterable, Identifiable, Sendable {
        case instant, daily, weekly, off
        var id: String { rawValue }
        var label: String {
            switch self {
            case .instant: "As they happen"
            case .daily: "Daily summary"
            case .weekly: "Weekly summary"
            case .off: "Off"
            }
        }
    }

    var comments: Frequency
    var reactions: Frequency
}

// Opens a review on its own screen.
nonisolated struct ReviewRoute: Hashable, Sendable {
    let logId: String
}

// Somewhere to go: a profile, or its followers / following list.
nonisolated struct ProfileRoute: Hashable, Sendable {
    let username: String
}

nonisolated struct FollowListRoute: Hashable, Sendable {
    enum Kind: String, Sendable { case followers, following }
    let username: String
    let kind: Kind
}
