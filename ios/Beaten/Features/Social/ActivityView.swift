import SwiftUI

// What the people you follow (or you) have been playing, as /activity on
// the web. Reviews take reactions and comments.
struct ActivityView: View {
    enum Scope: String, CaseIterable, Identifiable {
        case following, you
        var id: String { rawValue }
        var label: String { self == .following ? "Following" : "You" }
    }

    @Environment(AppModel.self) private var model
    @State private var scope: Scope = .following
    @State private var cards: [FeedCard] = []
    @State private var next: String?
    @State private var followsAnyone = true
    @State private var loaded = false
    @State private var loadingMore = false
    @State private var error: String?
    @State private var commenting: FeedCard?

    private var unread: Int { model.me?.social?.unreadNotifications ?? 0 }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                Picker("Show", selection: $scope) {
                    ForEach(Scope.allCases) { Text($0.label).tag($0) }
                }
                .pickerStyle(.segmented)
                .padding(.bottom, 4)

                if let error { ErrorBanner(message: error) }

                if !loaded {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 60)
                } else if cards.isEmpty {
                    empty
                } else {
                    ForEach($cards) { $card in
                        FeedCardView(card: $card, onComments: { commenting = card })
                    }
                    if let next {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                            .padding()
                            .task(id: next) { await loadMore() }
                    }
                }
            }
            .padding()
        }
        .background(Color.canvas)
        .navigationTitle("Activity")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                NavigationLink { PeopleSearchView() } label: {
                    Label("Find people", systemImage: "person.badge.plus")
                }
            }
            ToolbarItem(placement: .primaryAction) {
                NavigationLink { NotificationsView() } label: {
                    Label("Notifications", systemImage: unread > 0 ? "bell.badge" : "bell")
                }
                .accessibilityLabel(unread > 0 ? "Notifications, \(unread) new" : "Notifications")
            }
        }
        .task(id: scope) { await load() }
        .task { await model.refreshMe() }
        .refreshable { await load() }
        .sheet(item: $commenting) { card in
            CommentsSheet(review: card.summary!) { count in
                if let i = cards.firstIndex(where: { $0.id == card.id }) { cards[i].social?.commentCount = count }
            }
        }
        .gameDestinations()
    }

    @ViewBuilder private var empty: some View {
        VStack(spacing: 14) {
            Text(
                scope == .you
                    ? "Nothing yet. What you log shows up here."
                    : followsAnyone ? "Nothing from the people you follow yet." : "You're not following anyone yet."
            )
            .font(.subheadline)
            .foregroundStyle(Color.fog)
            .multilineTextAlignment(.center)
            if scope == .following && !followsAnyone {
                NavigationLink { PeopleSearchView() } label: {
                    Label("Find people", systemImage: "magnifyingglass").fontWeight(.semibold)
                }
                .buttonStyle(.borderedProminent)
                .foregroundStyle(Color.canvas)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(24)
        .background(Color.card.opacity(0.5), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Color.edge, style: StrokeStyle(lineWidth: 1, dash: [4])))
    }

    private func load() async {
        do {
            let page: FeedPage = try await model.api.get("/feed", query: ["scope": scope.rawValue])
            cards = page.cards
            next = page.next
            followsAnyone = page.followsAnyone
            error = nil
            loaded = true
        } catch is CancellationError {
        } catch {
            self.error = error.localizedDescription
            loaded = true
        }
    }

    private func loadMore() async {
        guard let cursor = next, !loadingMore else { return }
        loadingMore = true
        defer { loadingMore = false }
        do {
            let page: FeedPage = try await model.api.get("/feed", query: ["scope": scope.rawValue, "before": cursor])
            let have = Set(cards.map(\.id))
            cards += page.cards.filter { !have.contains($0.id) }
            next = page.next
        } catch is CancellationError {
        } catch {
            self.error = error.localizedDescription
            next = nil
        }
    }
}

// One card: who did what, the stars and review, and for reviews the
// reactions and a way into the comments.
struct FeedCardView: View {
    @Environment(AppModel.self) private var model
    @Binding var card: FeedCard
    let onComments: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            PersonLink(person: card.actor) { PersonAvatar(person: card.actor, size: 36) }
            VStack(alignment: .leading, spacing: 8) {
                if card.kind == .entry, let game = card.game, let log = card.log {
                    HStack(alignment: .top, spacing: 12) {
                        VStack(alignment: .leading, spacing: 6) {
                            headline(game: game, log: log)
                            if let rating = log.rating { Stars(rating: rating) }
                            if log.status == .shelved && log.notReturning {
                                Text("Not going back").font(.caption).foregroundStyle(Color.fog)
                            }
                            if card.reviewed == true, let review = log.reviewText {
                                ReviewBody(text: review, spoilers: log.containsSpoilers)
                            }
                        }
                        Spacer(minLength: 0)
                        NavigationLink(value: game) { Poster(url: game.coverUrl, width: 48) }
                            .buttonStyle(.plain)
                            .accessibilityLabel(game.name)
                    }
                    if let logId = card.logId, let social = Binding($card.social) {
                        ReactionBar(logId: logId, social: social, onComments: onComments)
                    }
                } else if let games = card.games {
                    Text("\(name) added \(games.count) older game\(games.count == 1 ? "" : "s") to their diary\(when)")
                        .font(.subheadline)
                        .foregroundStyle(Color.fog)
                    HStack(spacing: 8) {
                        ForEach(games.prefix(6)) { game in
                            NavigationLink(value: game) { Poster(url: game.coverUrl, width: 40) }
                                .buttonStyle(.plain)
                                .accessibilityLabel(game.name)
                        }
                        if games.count > 6 {
                            Text("+\(games.count - 6)").font(.caption).foregroundStyle(Color.fog)
                        }
                    }
                }
            }
        }
        .padding(14)
        .background(Color.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Color.edge))
        .contextMenu {
            if card.social != nil, let summary = card.summary {
                NavigationLink(value: ReviewRoute(logId: summary.logId)) { Label("Open review", systemImage: "text.bubble") }
                if card.actor.username != model.me?.username, let url = summary.reportURL {
                    Link(destination: url) { Label("Report review", systemImage: "flag") }
                }
            }
        }
    }

    private var name: Text { Text(card.actor.display).fontWeight(.semibold).foregroundStyle(.white) }
    private var when: Text { Text(" · \(card.at.timeAgo)").foregroundStyle(Color.fog.opacity(0.7)) }

    private func headline(game: Game, log: FeedCard.Log) -> some View {
        Text("\(name) \(card.verb ?? "logged") \(Text(game.name).fontWeight(.semibold).foregroundStyle(.white))\(log.isReplay ? " again" : "")\(when)")
            .font(.subheadline)
            .foregroundStyle(Color.fog)
    }
}

// Reaction chips (the ones people have used), a picker for the rest, and
// the comment count. Taps show at once and settle on the server's answer.
// The reactions belong to the review, so they're the same wherever it shows.
struct ReactionBar: View {
    @Environment(AppModel.self) private var model
    let logId: String
    @Binding var social: ReviewSocial
    // Nil where the comments are already showing (the review's own screen).
    let onComments: (() -> Void)?
    @State private var error: String?

    nonisolated private struct Response: Decodable { let social: ReviewSocial }
    private struct Payload: Encodable { let kind: String }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                ForEach(social.reactions.filter { $0.count > 0 }, id: \.kind) { r in
                    Button { toggle(r.kind) } label: {
                        Text("\(r.emoji) \(r.count)").monospacedDigit()
                    }
                    .buttonStyle(Chip(selected: r.mine))
                    .accessibilityLabel("\(r.label), \(r.count)")
                    .accessibilityAddTraits(r.mine ? .isSelected : [])
                }
                Menu {
                    ForEach(social.reactions, id: \.kind) { r in
                        Button { toggle(r.kind) } label: {
                            Text(r.mine ? "\(r.emoji)  \(r.label) ✓" : "\(r.emoji)  \(r.label)")
                        }
                    }
                } label: {
                    Image(systemName: "face.smiling")
                        .padding(.horizontal, 9)
                        .padding(.vertical, 4)
                        .overlay(Capsule().strokeBorder(Color.edge))
                }
                .accessibilityLabel("React")
                if let onComments {
                    Button(action: onComments) {
                        Label(
                            social.commentCount == 0 ? "Comment" : "\(social.commentCount) comment\(social.commentCount == 1 ? "" : "s")",
                            systemImage: "bubble.left"
                        )
                    }
                    .padding(.leading, 4)
                }
                Spacer(minLength: 0)
            }
            .font(.caption)
            .foregroundStyle(Color.fog)
            if let error { Text(error).font(.caption).foregroundStyle(.red) }
        }
        .sensoryFeedback(.selection, trigger: social.reactions.filter(\.mine).count)
    }

    private func toggle(_ kind: String) {
        let before = social
        error = nil
        social = before.toggled(kind)
        Task {
            do {
                let res: Response = try await model.api.send("POST", "/reviews/\(logId)/reactions", body: Payload(kind: kind))
                social = res.social
            } catch {
                social = before
                self.error = error.localizedDescription
            }
        }
    }
}

struct Chip: ButtonStyle {
    var selected = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .padding(.horizontal, 9)
            .padding(.vertical, 4)
            .foregroundStyle(selected ? .white : Color.fog)
            .background(selected ? Color.mint.opacity(0.15) : .clear, in: Capsule())
            .overlay(Capsule().strokeBorder(selected ? Color.mint.opacity(0.6) : Color.edge))
            .opacity(configuration.isPressed ? 0.6 : 1)
    }
}

// A review, blurred behind a tap when it's marked as containing spoilers.
struct ReviewBody: View {
    let text: String
    let spoilers: Bool
    @State private var shown = false

    var body: some View {
        if !spoilers || shown {
            Text(text).font(.subheadline).foregroundStyle(Color.fog).fixedSize(horizontal: false, vertical: true)
        } else {
            Button { shown = true } label: {
                Text(text)
                    .font(.subheadline)
                    .lineLimit(3)
                    .blur(radius: 5)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .overlay {
                        Text("Contains spoilers · show")
                            .font(.caption)
                            .foregroundStyle(.white)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 4)
                            .background(Color.canvas.opacity(0.9), in: Capsule())
                    }
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Show review (contains spoilers)")
        }
    }
}

extension Date {
    // "just now", "5m", "3h", "2d", then the date, like timeAgo on the web.
    var timeAgo: String {
        let s = Date.now.timeIntervalSince(self)
        if s < 60 { return "just now" }
        if s < 3600 { return "\(Int(s / 60))m" }
        if s < 86400 { return "\(Int(s / 3600))h" }
        if s < 7 * 86400 { return "\(Int(s / 86400))d" }
        return formatted(.dateTime.day().month(.abbreviated))
    }
}
