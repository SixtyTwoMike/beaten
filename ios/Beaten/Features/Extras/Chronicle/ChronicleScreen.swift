import SwiftUI

// Your console chronicle: the map in your chosen look, tap a console to
// edit it, + to add one, the paintbrush for title, birth year and style.
struct ChronicleScreen: View {
    @Environment(AppModel.self) private var app
    @State private var model: ChronicleModel?
    @State private var editing: ConsoleSheet.Target?
    @State private var styling = false
    @State private var makingVideo = false
    @State private var makingImage = false

    var body: some View {
        ScrollView {
            if let model, let chronicle = model.chronicle {
                VStack(spacing: 16) {
                    if let error = model.loadError { ErrorBanner(message: error) }
                    ChronicleMapView(chronicle: chronicle) { stop in
                        editing = .init(stop: stop)
                    }
                    if chronicle.stops.isEmpty {
                        Button("Add your first console", systemImage: "plus") { editing = .init(stop: nil) }
                            .buttonStyle(.borderedProminent)
                    }
                    if !chronicle.stops.isEmpty {
                        Button { makingVideo = true } label: {
                            Label("Make a story video", systemImage: "film")
                                .fontWeight(.semibold)
                                .frame(maxWidth: .infinity, minHeight: 30)
                        }
                        .buttonStyle(.borderedProminent)
                        .foregroundStyle(Color.canvas)
                        Button { makingImage = true } label: {
                            Label("Make an image", systemImage: "photo")
                                .fontWeight(.semibold)
                                .frame(maxWidth: .infinity, minHeight: 30)
                        }
                        .buttonStyle(.bordered)
                    }
                    if let username = chronicle.username, !chronicle.stops.isEmpty,
                       let url = URL(string: "https://beaten.games/\(username)/chronicles") {
                        ShareLink(item: url) {
                            Label("Share link", systemImage: "link")
                        }
                        .font(.subheadline)
                    }
                }
                .padding()
            } else if let error = model?.loadError {
                ErrorBanner(message: error).padding()
            } else {
                ProgressView().padding(.top, 80)
            }
        }
        .canvasBackground()
        .navigationTitle("Console Chronicles")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button("Style", systemImage: "paintbrush") { styling = true }
                    .disabled(model?.chronicle == nil)
                Button("Add console", systemImage: "plus") { editing = .init(stop: nil) }
                    .disabled(model?.chronicle == nil)
            }
        }
        .refreshable { await model?.load() }
        .task {
            if model == nil { model = ChronicleModel(api: app.api) }
            await model?.load()
        }
        .sheet(item: $editing) { target in
            if let model { ConsoleSheet(model: model, target: target) }
        }
        .sheet(isPresented: $makingImage) {
            if let chronicle = model?.chronicle { ChronicleCardSheet(chronicle: chronicle) }
        }
        .fullScreenCover(isPresented: $makingVideo) {
            if let chronicle = model?.chronicle { ChronicleVideoSheet(chronicle: chronicle) }
        }
        .sheet(isPresented: $styling) {
            if let model, let chronicle = model.chronicle { ChronicleStyleSheet(model: model, chronicle: chronicle) }
        }
    }
}
