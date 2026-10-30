import SwiftUI

// The comments on a review: read, add, delete (yours, or any on your own
// review), report. `onCount` keeps the card's comment count in step.
struct CommentsSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let card: FeedCard
    let onCount: (Int) -> Void

    @State private var comments: [Comment]?
    @State private var draft = ""
    @State private var posting = false
    @State private var error: String?
    @FocusState private var composing: Bool

    nonisolated private struct Response: Decodable { let comments: [Comment] }
    private struct Payload: Encodable { let body: String }

    private var logId: String { card.logId ?? "" }

    var body: some View {
        NavigationStack {
            List {
                if let game = card.game, let log = card.log {
                    Section {
                        HStack(alignment: .top, spacing: 12) {
                            PersonAvatar(person: card.actor, size: 32)
                            VStack(alignment: .leading, spacing: 6) {
                                Text("\(Text(card.actor.display).fontWeight(.semibold).foregroundStyle(.white)) on \(Text(game.name).fontWeight(.semibold).foregroundStyle(.white))")
                                    .font(.subheadline)
                                    .foregroundStyle(Color.fog)
                                if let rating = log.rating { Stars(rating: rating) }
                                if let text = log.reviewText { ReviewBody(text: text, spoilers: log.containsSpoilers) }
                            }
                        }
                        .listRowBackground(Color.card)
                    }
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
                }
                .listRowBackground(Color.card)
            }
            .canvasBackground()
            .navigationTitle("Comments")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Done", role: .close) { dismiss() } }
            }
            .safeAreaInset(edge: .bottom) { composer }
            .task { await load() }
        }
        .presentationDragIndicator(.visible)
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
                .focused($composing)
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

    private func load() async {
        do {
            let res: Response = try await model.api.get("/reviews/\(logId)/comments")
            // A comment posted meanwhile already brought the latest list.
            if comments == nil { comments = res.comments }
            onCount(comments?.count ?? 0)
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
                let res: Response = try await model.api.send("POST", "/reviews/\(logId)/comments", body: Payload(body: text))
                comments = res.comments
                draft = ""
                onCount(res.comments.count)
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    private func delete(_ c: Comment) {
        Task {
            do {
                try await model.api.send("DELETE", "/comments/\(c.id)")
                comments?.removeAll { $0.id == c.id }
                onCount(comments?.count ?? 0)
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}
