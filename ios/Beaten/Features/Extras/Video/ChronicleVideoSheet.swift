import AVKit
import SwiftUI

// Make a story video of your chronicle: pick a style (thumbnails are real
// frames), render it on the phone, preview, then share or save it.
struct ChronicleVideoSheet: View {
    @Environment(\.dismiss) private var dismiss
    let chronicle: Chronicle

    @State private var style: VideoStyle = .road
    @State private var images: VideoImages?
    @State private var thumbs: [VideoStyle: UIImage] = [:]
    @State private var progress: Double?
    @State private var file: URL?
    @State private var player: AVPlayer?
    @State private var render: Task<Void, Never>?
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    if let file, let player {
                        VideoPlayer(player: player)
                            .aspectRatio(9 / 16, contentMode: .fit)
                            .frame(maxHeight: 460)
                            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                            .onAppear { player.play() }
                        ShareLink(item: file, preview: SharePreview("My Console Chronicles", image: Image(systemName: "film"))) {
                            Label("Share video", systemImage: "square.and.arrow.up")
                                .fontWeight(.semibold)
                                .frame(maxWidth: .infinity, minHeight: 30)
                        }
                        .buttonStyle(.borderedProminent)
                        .foregroundStyle(Color.canvas)
                        Button("Try another style") { reset() }
                    } else {
                        styles
                        Text(style.blurb).font(.subheadline).foregroundStyle(Color.fog)
                        if let progress {
                            VStack(spacing: 8) {
                                ProgressView(value: progress).tint(Color.mint)
                                Text("Making your video… \(Int(progress * 100))%").font(.caption).foregroundStyle(Color.fog)
                            }
                        } else {
                            Button(action: make) {
                                Label("Make video", systemImage: "film")
                                    .fontWeight(.semibold)
                                    .frame(maxWidth: .infinity, minHeight: 30)
                            }
                            .buttonStyle(.borderedProminent)
                            .foregroundStyle(Color.canvas)
                            .disabled(images == nil)
                        }
                    }
                    if let error { ErrorBanner(message: error) }
                }
                .padding()
            }
            .canvasBackground()
            .navigationTitle("Story video")
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
            .task { await prepare() }
        }
    }

    private var styles: some View {
        HStack(spacing: 12) {
            ForEach(VideoStyle.allCases) { s in
                Button { style = s } label: {
                    VStack(spacing: 6) {
                        Group {
                            if let thumb = thumbs[s] {
                                Image(uiImage: thumb).resizable().scaledToFill()
                            } else {
                                Color.card.overlay { ProgressView() }
                            }
                        }
                        .aspectRatio(9 / 16, contentMode: .fit)
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                        .overlay {
                            RoundedRectangle(cornerRadius: 10, style: .continuous)
                                .strokeBorder(style == s ? Color.mint : Color.edge, lineWidth: style == s ? 3 : 1)
                        }
                        Text(s.label).font(.caption.weight(.semibold)).foregroundStyle(style == s ? .white : Color.fog)
                    }
                }
                .buttonStyle(.plain)
                .accessibilityLabel(s.label)
                .accessibilityAddTraits(style == s ? .isSelected : [])
                .disabled(progress != nil)
            }
        }
    }

    // Fetches the artwork once, then a frame of each style for its thumbnail.
    private func prepare() async {
        guard images == nil else { return }
        let loaded = await VideoImages.load(ChronicleVideo.imageURLs(chronicle))
        images = loaded
        let chronicle = chronicle
        for s in VideoStyle.allCases {
            let still = await Task.detached(priority: .userInitiated) {
                let plan = ChronicleVideo.plan(s, chronicle: chronicle, images: loaded)
                return VideoEncoder.still(plan, at: s.thumbnailTime(plan))
            }.value
            thumbs[s] = still
        }
    }

    private func make() {
        guard let images else { return }
        error = nil
        progress = 0
        let plan = ChronicleVideo.plan(style, chronicle: chronicle, images: images)
        let url = FileManager.default.temporaryDirectory.appending(path: "console-chronicles-\(style.rawValue).mp4")
        render = Task {
            do {
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

    private func reset() {
        player?.pause()
        player = nil
        file = nil
    }
}

extension VideoStyle {
    // A frame that shows off the style: first console mid-reveal.
    nonisolated func thumbnailTime(_ plan: VideoPlan) -> Double {
        switch self {
        case .road: min(plan.duration, 1.6 + 1.4)
        case .years: min(plan.duration, 1.2 + 1.6)
        case .crt: min(plan.duration, 1.6 + 1.2)
        }
    }
}
