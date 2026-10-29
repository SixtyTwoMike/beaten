import SwiftUI

struct GameView: View {
    @Environment(AppModel.self) private var model
    let game: Game

    @State private var detail: GameDetail?
    @State private var error: String?
    @State private var logging: LogSheet.Target?
    @State private var deleting: PlayLog?
    @State private var showFullSummary = false

    private var shown: Game { detail?.game ?? game }

    // Kept in step with the diary, so saving or deleting here shows at once.
    private var logs: [PlayLog] {
        model.logs
            .filter { $0.game?.igdbId == game.igdbId }
            .sorted { ($0.finishedAt?.date ?? $0.updatedAt) > ($1.finishedAt?.date ?? $1.updatedAt) }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                header
                if let error { ErrorBanner(message: error) }

                Button { logging = .init(game: shown, status: .beaten) } label: {
                    Label(logs.isEmpty ? "Log this game" : "Log again", systemImage: "plus")
                        .fontWeight(.semibold)
                        .frame(maxWidth: .infinity, minHeight: 30)
                }
                .buttonStyle(.borderedProminent)
                .foregroundStyle(Color.canvas)

                if !logs.isEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        SectionTitle("Your entries")
                        ForEach(logs) { log in entry(log) }
                    }
                }

                if !model.shelves.isEmpty { shelves }

                if let summary = shown.summary, !summary.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        SectionTitle("About")
                        Text(summary)
                            .font(.subheadline)
                            .foregroundStyle(.white.opacity(0.85))
                            .lineLimit(showFullSummary ? nil : 5)
                        Button(showFullSummary ? "Less" : "More") { showFullSummary.toggle() }
                            .font(.footnote)
                    }
                }
            }
            .padding()
        }
        .background(Color.canvas)
        .navigationTitle(shown.name)
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .sheet(item: $logging) { LogSheet(target: $0) }
        .confirmationDialog("Delete this entry?", isPresented: .init(get: { deleting != nil }, set: { if !$0 { deleting = nil } }), titleVisibility: .visible) {
            Button("Delete", role: .destructive) {
                guard let log = deleting else { return }
                Task {
                    do { try await model.deleteLog(log) } catch { self.error = error.localizedDescription }
                }
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let art = shown.artworkUrl {
                AsyncImage(url: art) { $0.resizable().scaledToFill() } placeholder: { Color.card }
                    .frame(height: 170)
                    .frame(maxWidth: .infinity)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .overlay(alignment: .bottom) {
                        LinearGradient(colors: [.clear, .canvas.opacity(0.9)], startPoint: .center, endPoint: .bottom)
                            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    }
                    .accessibilityHidden(true)
            }
            HStack(alignment: .bottom, spacing: 14) {
                Poster(url: shown.coverUrl, width: 96)
                    .offset(y: shown.artworkUrl == nil ? 0 : -6)
                VStack(alignment: .leading, spacing: 4) {
                    Text(shown.name).font(.title3.bold())
                    if let year = shown.releaseYear {
                        Text(String(year)).font(.subheadline).foregroundStyle(Color.fog)
                    }
                    let names = shown.platformIds.compactMap { model.platformName($0) }
                    if !names.isEmpty {
                        Text(names.prefix(4).joined(separator: " · ") + (names.count > 4 ? " +\(names.count - 4)" : ""))
                            .font(.caption)
                            .foregroundStyle(Color.fog)
                            .lineLimit(2)
                    }
                }
            }
        }
    }

    private func entry(_ log: PlayLog) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                StatusBadge(status: log.status)
                if log.isReplay { Text("Replay").font(.caption).foregroundStyle(Color.fog) }
                Spacer()
                if let rating = log.rating { Stars(rating: rating) }
            }
            Text(log.dateLine(platform: model.platformName(log.platformId)))
                .font(.caption)
                .foregroundStyle(Color.fog)
            if let review = log.reviewText {
                Text(review).font(.subheadline).foregroundStyle(.white.opacity(0.9))
            }
            HStack(spacing: 18) {
                Button("Edit") { logging = .init(game: shown, status: log.status, log: log) }
                Button("Delete", role: .destructive) { deleting = log }
            }
            .font(.footnote.weight(.medium))
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var shelves: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionTitle("Shelves")
            FlowLayout(spacing: 8) {
                ForEach(model.shelves) { shelf in
                    let on = shelf.games.contains { $0.igdbId == game.igdbId }
                    Button {
                        Task {
                            do { try await model.setGame(shown, onShelf: shelf, !on) } catch { self.error = error.localizedDescription }
                        }
                    } label: {
                        Label(shelf.name, systemImage: on ? "checkmark" : "plus")
                            .font(.footnote.weight(.medium))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 7)
                            .foregroundStyle(on ? Color.canvas : .white)
                            .background(on ? Color.mint : Color.card, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(on ? .isSelected : [])
                }
            }
        }
    }

    private func load() async {
        do {
            detail = try await model.gameDetail(game.igdbId)
        } catch is CancellationError {
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// Wraps chips onto as many lines as they need.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = arrange(proposal.width ?? .infinity, subviews)
        return CGSize(width: proposal.width ?? rows.width, height: rows.height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let rows = arrange(bounds.width, subviews)
        for (index, point) in rows.points.enumerated() {
            subviews[index].place(at: CGPoint(x: bounds.minX + point.x, y: bounds.minY + point.y), proposal: .unspecified)
        }
    }

    private func arrange(_ width: CGFloat, _ subviews: Subviews) -> (points: [CGPoint], width: CGFloat, height: CGFloat) {
        var points: [CGPoint] = []
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0, maxX: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > 0 && x + size.width > width {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            points.append(CGPoint(x: x, y: y))
            x += size.width + spacing
            maxX = max(maxX, x - spacing)
            rowHeight = max(rowHeight, size.height)
        }
        return (points, maxX, y + rowHeight)
    }
}
