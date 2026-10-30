import AVKit
import SwiftUI

// Everything you finished in a year (the web's /extras/year), and its
// story video, made on the phone.
struct YearReviewScreen: View {
    @Environment(AppModel.self) private var app
    @State private var year = Calendar.current.component(.year, from: .now)
    @State private var review: YearReview?
    @State private var error: String?
    @State private var makingVideo = false

    private var thisYear: Int { Calendar.current.component(.year, from: .now) }

    nonisolated private struct Response: Decodable { let review: YearReview }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if let review {
                    years(review)
                    HStack(spacing: 10) {
                        stat("Finished", review.finished, .mint)
                        stat("Beaten", review.beaten, .white)
                        stat("Mastered", review.mastered, .gold)
                    }
                    if review.finished == 0 {
                        Text("Nothing finished in \(String(review.year)) yet. Games you log as beaten or mastered with a \(String(review.year)) finish date show up here.")
                            .font(.subheadline)
                            .foregroundStyle(Color.fog)
                    } else {
                        Button { makingVideo = true } label: {
                            Label("Make a story video", systemImage: "film")
                                .fontWeight(.semibold)
                                .frame(maxWidth: .infinity, minHeight: 30)
                        }
                        .buttonStyle(.borderedProminent)
                        .foregroundStyle(Color.canvas)
                        if let first = review.firstGame {
                            HStack(spacing: 14) {
                                Poster(url: first.coverUrl, width: 52)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("FIRST GAME FINISHED").font(.caption2).foregroundStyle(Color.fog)
                                    Text(first.name).font(.headline)
                                    Text(YearReview.dayMonth(first.finishedAt)).font(.subheadline).foregroundStyle(Color.fog)
                                }
                                Spacer(minLength: 0)
                            }
                            .padding(14)
                            .background(Color.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Color.edge))
                        }
                        if let best = review.bestMonth {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("MOST PRODUCTIVE MONTH").font(.caption2).foregroundStyle(Color.fog)
                                Text(YearReview.months[best.month - 1]).font(.title2.bold()).foregroundStyle(Color.mint)
                                Text(best.count == 1 ? "1 game finished" : "\(best.count) games finished").font(.subheadline).foregroundStyle(Color.fog)
                            }
                            .padding(14)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Color.edge))
                        }
                        SectionTitle("Everything you finished")
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 72), spacing: 10)], spacing: 10) {
                            ForEach(Array(review.games.reversed().enumerated()), id: \.offset) { _, g in
                                Poster(url: g.coverUrl, width: 72).accessibilityLabel(g.name)
                            }
                        }
                    }
                } else if let error {
                    ErrorBanner(message: error)
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 80)
                }
            }
            .padding()
        }
        .canvasBackground()
        .navigationTitle("Year in review")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: year) { await load() }
        .refreshable { await load() }
        .fullScreenCover(isPresented: $makingVideo) {
            if let review { YearVideoSheet(review: review) }
        }
    }

    private func years(_ review: YearReview) -> some View {
        let all = Array(Set([thisYear] + review.years)).sorted(by: >)
        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(all, id: \.self) { y in
                    Button(String(y)) { year = y }
                        .font(.subheadline.weight(.medium))
                        .padding(.horizontal, 14)
                        .padding(.vertical, 6)
                        .foregroundStyle(y == year ? .white : Color.fog)
                        .background(y == year ? Color.mint.opacity(0.15) : .clear, in: Capsule())
                        .overlay(Capsule().strokeBorder(y == year ? Color.mint.opacity(0.6) : Color.edge))
                        .accessibilityAddTraits(y == year ? .isSelected : [])
                }
            }
        }
    }

    private func stat(_ label: String, _ value: Int, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(String(value)).font(.title.bold()).foregroundStyle(color)
            Text(label.uppercased()).font(.caption2).foregroundStyle(Color.fog)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Color.edge))
    }

    private func load() async {
        do {
            let res: Response = try await app.api.get("/year-review", query: ["year": String(year)])
            review = res.review
            error = nil
        } catch is CancellationError {
        } catch {
            self.error = error.localizedDescription
        }
    }
}

private struct YearVideoSheet: View {
    @Environment(\.dismiss) private var dismiss
    let review: YearReview

    @State private var progress: Double?
    @State private var file: URL?
    @State private var player: AVPlayer?
    @State private var render: Task<Void, Never>?
    @State private var error: String?

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                if let file, let player {
                    VideoPlayer(player: player)
                        .aspectRatio(9 / 16, contentMode: .fit)
                        .frame(maxHeight: 480)
                        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                        .onAppear { player.play() }
                    ShareLink(item: file, preview: SharePreview("My \(String(review.year)) in games", image: Image(systemName: "film"))) {
                        Label("Share video", systemImage: "square.and.arrow.up")
                            .fontWeight(.semibold)
                            .frame(maxWidth: .infinity, minHeight: 30)
                    }
                    .buttonStyle(.borderedProminent)
                    .foregroundStyle(Color.canvas)
                } else if let progress {
                    Spacer()
                    ProgressView(value: progress).tint(Color.mint)
                    Text("Making your video… \(Int(progress * 100))%").font(.caption).foregroundStyle(Color.fog)
                    Spacer()
                }
                if let error { ErrorBanner(message: error) }
            }
            .padding()
            .canvasBackground()
            .navigationTitle("My \(String(review.year)) in games")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close", role: .close) {
                        render?.cancel()
                        dismiss()
                    }
                }
            }
            .interactiveDismissDisabled(progress != nil)
            .task { make() }
        }
    }

    private func make() {
        guard render == nil else { return }
        progress = 0
        let review = review
        let url = FileManager.default.temporaryDirectory.appending(path: "beaten-\(review.year)-in-review.mp4")
        render = Task {
            do {
                let images = await VideoImages.load(YearReviewPlan.imageURLs(review))
                let plan = YearReviewPlan(review: review, images: images)
                try await Task.detached(priority: .userInitiated) {
                    try await VideoEncoder.render(plan, to: url) { p in
                        Task { @MainActor in progress = p }
                    }
                }.value
                file = url
                player = AVPlayer(url: url)
            } catch is CancellationError {
            } catch {
                self.error = error.localizedDescription
            }
            progress = nil
        }
    }
}
