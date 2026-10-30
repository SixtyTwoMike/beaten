import SwiftUI

// Opens someone's profile.
struct PersonLink<Label: View>: View {
    let person: Person
    @ViewBuilder let label: () -> Label

    var body: some View {
        if let username = person.username {
            NavigationLink(value: ProfileRoute(username: username), label: label)
                .buttonStyle(.plain)
                .accessibilityLabel(person.display)
        } else {
            label()
        }
    }
}

// A profile picture: their game crop, else their Google photo, else an initial.
struct PersonAvatar: View {
    let person: Person
    let size: CGFloat

    var body: some View {
        if person.avatar != nil {
            AvatarView(avatar: person.avatar, size: size)
        } else if let url = person.imageUrl {
            AsyncImage(url: url) { image in image.resizable().scaledToFill() } placeholder: { Color.card2 }
                .frame(width: size, height: size)
                .clipShape(Circle())
                .accessibilityHidden(true)
        } else {
            Circle().fill(Color.card2)
                .frame(width: size, height: size)
                .overlay {
                    Text(String(person.display.trimmingCharacters(in: CharacterSet(charactersIn: "@")).prefix(1)).uppercased())
                        .font(.system(size: size * 0.42, weight: .semibold))
                        .foregroundStyle(Color.fog)
                }
                .accessibilityHidden(true)
        }
    }
}

struct PersonRow: View {
    let person: Person

    var body: some View {
        HStack(spacing: 12) {
            PersonAvatar(person: person, size: 40)
            VStack(alignment: .leading, spacing: 2) {
                Text(person.display).font(.subheadline.weight(.semibold)).lineLimit(1)
                if let username = person.username {
                    Text("@\(username)").font(.caption).foregroundStyle(Color.fog).lineLimit(1)
                }
            }
            Spacer(minLength: 0)
        }
        .contentShape(Rectangle())
    }
}

// Find people by username or display name (/people on the web).
struct PeopleSearchView: View {
    @Environment(AppModel.self) private var model
    @State private var query = ""
    @State private var people: [Person]?
    @State private var error: String?

    nonisolated private struct Response: Decodable { let people: [Person] }

    var body: some View {
        List {
            if let error { ErrorBanner(message: error).listRowBackground(Color.clear) }
            if let people {
                if people.isEmpty {
                    Text("No one found for \u{201C}\(query)\u{201D}.").foregroundStyle(Color.fog)
                }
                ForEach(people, id: \.username) { person in
                    NavigationLink(value: ProfileRoute(username: person.username ?? "")) { PersonRow(person: person) }
                }
            } else {
                Text("Search for friends by their Beaten username or name.").font(.subheadline).foregroundStyle(Color.fog)
            }
        }
        .canvasBackground()
        .navigationTitle("Find people")
        .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Name or username")
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .task(id: query) {
            let q = query.trimmingCharacters(in: .whitespaces)
            guard q.count >= 2 else { people = nil; return }
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            do {
                let res: Response = try await model.api.get("/people", query: ["q": q])
                people = res.people
                error = nil
            } catch is CancellationError {
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}

// Someone's followers, or who they follow.
struct FollowListView: View {
    @Environment(AppModel.self) private var model
    let route: FollowListRoute
    @State private var people: [Person] = []
    @State private var page = 0
    @State private var more = false
    @State private var loaded = false
    @State private var error: String?

    nonisolated private struct Response: Decodable { let people: [Person]; let more: Bool }

    var body: some View {
        List {
            if let error { ErrorBanner(message: error).listRowBackground(Color.clear) }
            if loaded && people.isEmpty {
                Text(route.kind == .followers ? "No followers yet." : "Not following anyone yet.").foregroundStyle(Color.fog)
            }
            ForEach(people, id: \.username) { person in
                NavigationLink(value: ProfileRoute(username: person.username ?? "")) { PersonRow(person: person) }
            }
            if more {
                ProgressView().frame(maxWidth: .infinity).task(id: page) { await load(page + 1) }
            }
        }
        .canvasBackground()
        .navigationTitle(route.kind == .followers ? "Followers" : "Following")
        .navigationBarTitleDisplayMode(.inline)
        .task { if !loaded { await load(0) } }
        .refreshable { await load(0) }
    }

    private func load(_ n: Int) async {
        do {
            let res: Response = try await model.api.get("/users/\(route.username)/\(route.kind.rawValue)", query: ["page": String(n)])
            people = n == 0 ? res.people : people + res.people
            page = n
            more = res.more
            loaded = true
            error = nil
            // Seeing your own followers clears the new-followers dot.
            if route.kind == .followers, route.username == model.me?.username { await model.refreshMe() }
        } catch is CancellationError {
        } catch {
            self.error = error.localizedDescription
            more = false
            loaded = true
        }
    }
}

// Someone's public profile (/<username>), with follow, block and report.
struct UserProfileView: View {
    @Environment(AppModel.self) private var model
    let username: String
    @State private var profile: Profile?
    @State private var error: String?
    @State private var busy = false
    @State private var confirmUnfollow = false
    @State private var confirmBlock = false

    nonisolated private struct Response: Decodable { let profile: Profile }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                if let error { ErrorBanner(message: error) }
                if let profile {
                    header(profile)
                    stats(profile.stats)
                    if !profile.playing.isEmpty {
                        section("Currently playing") { covers(profile.playing) }
                    }
                    section("Finished · \(profile.finishedTotal)") {
                        if profile.finished.isEmpty {
                            Text("Nothing logged yet.").font(.subheadline).foregroundStyle(Color.fog)
                        } else {
                            covers(profile.finished.compactMap(\.game))
                        }
                    }
                    if !profile.reviews.isEmpty {
                        section("Recent reviews") {
                            VStack(spacing: 12) {
                                ForEach(profile.reviews) { review($0) }
                            }
                        }
                    }
                } else if error == nil {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 80)
                }
            }
            .padding()
        }
        .background(Color.canvas)
        .navigationTitle(profile?.user.display ?? "@\(username)")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let profile, !profile.relation.isYou {
                ToolbarItem(placement: .primaryAction) { menu(profile) }
            }
        }
        .task { await load() }
        .refreshable { await load() }
        .confirmationDialog("Unfollow @\(username)?", isPresented: $confirmUnfollow, titleVisibility: .visible) {
            Button("Unfollow", role: .destructive) { change("DELETE", "follow") }
        }
        .confirmationDialog("Block @\(username)?", isPresented: $confirmBlock, titleVisibility: .visible) {
            Button("Block", role: .destructive) { change("POST", "block") }
        } message: {
            Text("You'll stop following each other and won't see each other's activity or comments. They can still see your public profile.")
        }
    }

    private func header(_ p: Profile) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 14) {
                PersonAvatar(person: p.user, size: 72)
                VStack(alignment: .leading, spacing: 3) {
                    Text(p.user.display).font(.title3.bold())
                    Text("@\(username) · Member since \(p.memberSince.formatted(.dateTime.month(.abbreviated).year()))")
                        .font(.caption)
                        .foregroundStyle(Color.fog)
                    HStack(spacing: 16) {
                        NavigationLink(value: FollowListRoute(username: username, kind: .followers)) {
                            Text("\(Text("\(p.counts.followers)").fontWeight(.semibold).foregroundStyle(.white)) follower\(p.counts.followers == 1 ? "" : "s")")
                        }
                        NavigationLink(value: FollowListRoute(username: username, kind: .following)) {
                            Text("\(Text("\(p.counts.following)").fontWeight(.semibold).foregroundStyle(.white)) following")
                        }
                    }
                    .font(.subheadline)
                    .foregroundStyle(Color.fog)
                    .buttonStyle(.plain)
                    .padding(.top, 2)
                }
            }
            if p.relation.canFollow { followButton(p.relation) }
            if p.instagram != nil || p.bluesky != nil {
                HStack(spacing: 16) {
                    if let ig = p.instagram, let url = URL(string: "https://www.instagram.com/\(ig)/") {
                        Link("Instagram @\(ig)", destination: url)
                    }
                    if let bs = p.bluesky, let url = URL(string: "https://bsky.app/profile/\(bs)") {
                        Link("Bluesky @\(bs)", destination: url)
                    }
                }
                .font(.caption)
                .foregroundStyle(Color.fog)
            }
        }
    }

    @ViewBuilder private func followButton(_ r: Profile.Relation) -> some View {
        Group {
            if r.blocked {
                Button("Unblock") { change("DELETE", "block") }.buttonStyle(.bordered)
            } else if r.following {
                Button { confirmUnfollow = true } label: { Label("Following", systemImage: "checkmark") }
                    .buttonStyle(.bordered)
            } else {
                Button("Follow") { change("POST", "follow") }
                    .buttonStyle(.borderedProminent)
                    .foregroundStyle(Color.canvas)
            }
        }
        .fontWeight(.semibold)
        .controlSize(.regular)
        .disabled(busy)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func menu(_ p: Profile) -> some View {
        Menu {
            ShareLink(item: APIClient.baseURL.appending(path: username)) { Label("Share profile", systemImage: "square.and.arrow.up") }
            if !p.relation.blocked {
                Button(role: .destructive) { confirmBlock = true } label: { Label("Block @\(username)", systemImage: "hand.raised") }
            }
            if let url = Support.reportURL(subject: "Report @\(username)", body: "Profile: \(APIClient.baseURL.appending(path: username).absoluteString)\n\nWhat's wrong:\n") {
                Link(destination: url) { Label("Report @\(username)", systemImage: "flag") }
            }
        } label: {
            Label("More", systemImage: "ellipsis")
        }
    }

    private func stats(_ s: Stats) -> some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
            tile("Now playing", s.playing, .sky)
            tile("Games beaten", s.beaten, .mint)
            tile("Mastered", s.mastered, .gold)
            tile("Finished in \(String(s.year))", s.finishedThisYear, .white)
        }
    }

    private func tile(_ label: String, _ value: Int, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("\(value)").font(.title2.bold()).foregroundStyle(color).monospacedDigit()
            Text(label).font(.caption).foregroundStyle(Color.fog)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionTitle(title)
            content()
        }
    }

    private func covers(_ games: [Game]) -> some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 72), spacing: 10)], spacing: 10) {
            ForEach(Array(games.enumerated()), id: \.offset) { _, game in
                NavigationLink(value: game) { Poster(url: game.coverUrl, width: 72) }
                    .buttonStyle(.plain)
                    .accessibilityLabel(game.name)
            }
        }
    }

    private func review(_ log: PlayLog) -> some View {
        HStack(alignment: .top, spacing: 12) {
            if let game = log.game {
                NavigationLink(value: game) { Poster(url: game.coverUrl, width: 48) }.buttonStyle(.plain)
            }
            VStack(alignment: .leading, spacing: 5) {
                Text(log.game?.name ?? "").font(.subheadline.weight(.semibold))
                HStack(spacing: 6) {
                    StatusBadge(status: log.status)
                    if let rating = log.rating { Stars(rating: rating, size: 10) }
                }
                if let text = log.reviewText { ReviewBody(text: text, spoilers: log.containsSpoilers) }
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .background(Color.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func load() async {
        do {
            let res: Response = try await model.api.get("/users/\(username)")
            profile = res.profile
            error = nil
        } catch is CancellationError {
        } catch {
            self.error = error.localizedDescription
        }
    }

    // POST/DELETE /users/:username/follow|block, which answer with the profile.
    private func change(_ method: String, _ what: String) {
        busy = true
        Task {
            defer { busy = false }
            do {
                let res: Response = try await model.api.send(method, "/users/\(username)/\(what)", body: Optional<String>.none)
                profile = res.profile
                error = nil
                await model.refreshMe()
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}

enum Support {
    static let email = "support@beaten.games"

    static func reportURL(subject: String, body: String) -> URL? {
        var c = URLComponents()
        c.scheme = "mailto"
        c.path = email
        c.queryItems = [URLQueryItem(name: "subject", value: subject), URLQueryItem(name: "body", value: body)]
        return c.url
    }
}
