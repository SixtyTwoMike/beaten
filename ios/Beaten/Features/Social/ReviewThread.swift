import SwiftUI

// What a comments thread needs to know about its review.
struct ReviewSummary: Identifiable {
    let logId: String
    let author: Person
    let gameName: String
    let rating: Int?
    let text: String?
    let spoilers: Bool

    var id: String { logId }

    var reportURL: URL? {
        Support.reportURL(subject: "Report a review by @\(author.username ?? "")", body: "Review: \(logId)\n\nWhat's wrong:\n")
    }
}

extension FeedCard {
    var summary: ReviewSummary? {
        guard let logId, let game, let log else { return nil }
        return ReviewSummary(logId: logId, author: actor, gameName: game.name, rating: log.rating, text: log.reviewText, spoilers: log.containsSpoilers)
    }
}

// A review with its comments: read, add, delete (yours, or any on your own
// review), report. With `social`, its reactions too. `onCount` keeps a
// card's comment count in step.
struct ReviewThread: View {
    @Environment(AppModel.self) private var model
    let review: ReviewSummary
    var social: Binding<ReviewSocial>? = nil
    var onCount: (Int) -> Void = { _ in }

    @State private var comments: [Comment]?
    @State private var draft = ""
    @State private var posting = false
    @State private var error: String?

    nonisolated private struct Response: Decodable { let comments: [Comment] }
    private struct Payload: Encodable { let body: String }

    var body: some View {
        List {
            Section {
                HStack(alignment: .top, spacing: 12) {
                    PersonAvatar(person: review.author, size: 32)
                    VStack(alignment: .leading, spacing: 6) {
                        Text("\(Text(review.author.display).fontWeight(.semibold).foregroundStyle(.white)) on \(Text(review.gameName).fontWeight(.semibold).foregroundStyle(.white))")
                            .font(.subheadline)
                            .foregroundStyle(Color.fog)
                        if let rating = review.rating { Stars(rating: rating) }
                        if let text = review.text { ReviewBody(text: text, spoilers: review.spoilers) }
                        if let social {
                            ReactionBar(logId: review.logId, social: social, onComments: nil).padding(.top, 4)
                        }
                    }
                }
                .listRowBackground(Color.card)
            }

            if let error { ErrorBanner(message: error).listRowBackground(Color.clear) }

            Section {
                if let comments {
                    if comments.isEmpty {
                        Text("No comments yet. Say something nice.").font(.subheadline).foregroundStyle(Color.fog)
                    }
                    ForEach(comments) { comment in
                        row(comment)
                            .swipeActions {
                                if comment.canDelete {
                                    Button("Delete", systemImage: "trash", role: .destructive) { delete(comment) }
                                }
                            }
                            .contextMenu {
                                if comment.canDelete {
                                    Button("Delete", systemImage: "trash", role: .destructive) { delete(comment) }
                                }
                                if let url = reportURL(comment) {
                                    Link(destination: url) { Label("Report comment", systemImage: "flag") }
                                }
                            }
                    }
                } else {
                    ProgressView().frame(maxWidth: .infinity)
                }
            } header: {
                Text("Comments")
            }
            .listRowBackground(Color.card)
        }
        .canvasBackground()
        .safeAreaInset(edge: .bottom) { composer }
        .task { await load() }
        .refreshable { await load(force: true) }
    }

    private func row(_ c: Comment) -> some View {
        HStack(alignment: .top, spacing: 10) {
            PersonAvatar(person: c.author, size: 28)
            VStack(alignment: .leading, spacing: 3) {
                Text("\(Text(c.author.display).fontWeight(.semibold).foregroundStyle(.white)) \(Text("· \(c.createdAt.timeAgo)").foregroundStyle(Color.fog.opacity(0.7)))")
                    .font(.caption)
                Text(c.body).font(.subheadline).foregroundStyle(Color.fog).fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
    }

    private var composer: some View {
        HStack(alignment: .bottom, spacing: 8) {
            TextField("Add a comment…", text: $draft, axis: .vertical)
                .lineLimit(1...5)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Color.card2, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                .onChange(of: draft) { if draft.count > 1000 { draft = String(draft.prefix(1000)) } }
            Button(action: post) {
                Image(systemName: "arrow.up.circle.fill").font(.system(size: 30))
            }
            .disabled(posting || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || comments == nil)
            .accessibilityLabel("Post comment")
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
        .background(.bar)
    }

    private func reportURL(_ c: Comment) -> URL? {
        Support.reportURL(
            subject: "Report a comment by @\(c.author.username ?? "")",
            body: "Comment: \(c.id)\n\n\u{201C}\(c.body.prefix(300))\u{201D}\n\nWhat's wrong:\n"
        )
    }

    private func setComments(_ list: [Comment]) {
        comments = list
        onCount(list.count)
        social?.wrappedValue.commentCount = list.count
    }

    private func load(force: Bool = false) async {
        do {
            let res: Response = try await model.api.get("/reviews/\(review.logId)/comments")
            // A comment posted meanwhile already brought the latest list.
            if comments == nil || force { setComments(res.comments) }
        } catch is CancellationError {
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func post() {
        posting = true
        error = nil
        let text = draft
        Task {
            defer { posting = false }
            do {
                let res: Response = try await model.api.send("POST", "/reviews/\(review.logId)/comments", body: Payload(body: text))
                setComments(res.comments)
                draft = ""
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    private func delete(_ c: Comment) {
        Task {
            do {
                try await model.api.send("DELETE", "/comments/\(c.id)")
                setComments((comments ?? []).filter { $0.id != c.id })
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}

// The comments on a review, from a card or a profile.
struct CommentsSheet: View {
    @Environment(\.dismiss) private var dismiss
    let review: ReviewSummary
    let onCount: (Int) -> Void

    var body: some View {
        NavigationStack {
            ReviewThread(review: review, onCount: onCount)
                .navigationTitle("Comments")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Done", role: .close) { dismiss() } }
                }
                .gameDestinations()
        }
        .presentationDragIndicator(.visible)
    }
}

// A review on its own screen (where notifications go), with its reactions
// and comments.
struct ReviewScreen: View {
    @Environment(AppModel.self) private var model
    let logId: String
    @State private var detail: ReviewDetail?
    @State private var error: String?

    nonisolated private struct Response: Decodable { let review: ReviewDetail }

    var body: some View {
        Group {
            if let detail, let game = detail.log.game {
                ReviewThread(
                    review: ReviewSummary(
                        logId: logId,
                        author: detail.author,
                        gameName: game.name,
                        rating: detail.log.rating,
                        text: detail.log.reviewText,
                        spoilers: detail.log.containsSpoilers
                    ),
                    social: Binding(get: { self.detail?.social ?? detail.social }, set: { self.detail?.social = $0 })
                )
                .toolbar {
                    ToolbarItem(placement: .primaryAction) {
                        Menu {
                            NavigationLink(value: game) { Label(game.name, systemImage: "gamecontroller") }
                            if let username = detail.author.username {
                                ShareLink(item: APIClient.baseURL.appending(path: "\(username)/reviews/\(logId)")) {
                                    Label("Share review", systemImage: "square.and.arrow.up")
                                }
                            }
                            if !detail.isYours, let url = Support.reportURL(subject: "Report a review by @\(detail.author.username ?? "")", body: "Review: \(logId)\n\nWhat's wrong:\n") {
                                Link(destination: url) { Label("Report review", systemImage: "flag") }
                            }
                        } label: {
                            Label("More", systemImage: "ellipsis")
                        }
                    }
                }
            } else if let error {
                ErrorBanner(message: error).padding().frame(maxHeight: .infinity, alignment: .top)
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(Color.canvas)
        .navigationTitle("Review")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            do {
                let res: Response = try await model.api.get("/reviews/\(logId)")
                detail = res.review
            } catch is CancellationError {
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}
