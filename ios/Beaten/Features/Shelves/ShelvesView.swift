import SwiftUI

struct ShelvesView: View {
    @Environment(AppModel.self) private var model
    @State private var creating = false
    @State private var deleting: Shelf?
    @State private var error: String?

    var body: some View {
        List {
            if let error { ErrorBanner(message: error).listRowBackground(Color.clear) }
            ForEach(model.shelves) { shelf in
                NavigationLink(value: shelf) {
                    HStack(spacing: -18) {
                        ForEach(shelf.games.prefix(3)) { Poster(url: $0.coverUrl, width: 40) }
                        if shelf.games.isEmpty { Poster(url: nil, width: 40) }
                    }
                    .frame(width: 84, alignment: .leading)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(shelf.name).font(.subheadline.weight(.semibold))
                        Text(shelf.games.count == 1 ? "1 game" : "\(shelf.games.count) games")
                            .font(.caption)
                            .foregroundStyle(Color.fog)
                    }
                }
                .listRowBackground(Color.canvas)
                .swipeActions {
                    Button("Delete", systemImage: "trash", role: .destructive) { deleting = shelf }
                }
            }
        }
        .listStyle(.plain)
        .canvasBackground()
        .overlay {
            if model.shelves.isEmpty {
                ContentUnavailableView("No shelves yet", systemImage: "books.vertical", description: Text("Shelves are your own collections: favourites, backlog, best of the year…"))
            }
        }
        .navigationTitle("Shelves")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("New shelf", systemImage: "plus") { creating = true }
            }
        }
        .refreshable { await model.refresh() }
        .sheet(isPresented: $creating) { NewShelfSheet() }
        .confirmationDialog(
            "Delete \u{201C}\(deleting?.name ?? "")\u{201D}?",
            isPresented: .init(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
            titleVisibility: .visible
        ) {
            Button("Delete shelf", role: .destructive) {
                guard let shelf = deleting else { return }
                Task {
                    do { try await model.deleteShelf(shelf) } catch { self.error = error.localizedDescription }
                }
            }
        } message: {
            Text("The games stay in your diary.")
        }
        .navigationDestination(for: Shelf.self) { ShelfView(shelfId: $0.id) }
        .gameDestinations()
    }
}

private struct ShelfView: View {
    @Environment(AppModel.self) private var model
    let shelfId: String

    // Live from the model, so removing a game updates the grid.
    private var shelf: Shelf? { model.shelves.first { $0.id == shelfId } }

    var body: some View {
        ScrollView {
            if let shelf {
                VStack(alignment: .leading, spacing: 16) {
                    if let description = shelf.description, !description.isEmpty {
                        Text(description).font(.subheadline).foregroundStyle(Color.fog)
                    }
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 100), spacing: 12)], spacing: 16) {
                        ForEach(shelf.games) { game in
                            NavigationLink(value: game) {
                                VStack(alignment: .leading, spacing: 6) {
                                    Poster(url: game.coverUrl, width: 100)
                                    Text(game.name).font(.caption.weight(.medium)).lineLimit(2)
                                }
                            }
                            .buttonStyle(.plain)
                            .contextMenu {
                                Button("Remove from shelf", systemImage: "minus.circle", role: .destructive) {
                                    Task { try? await model.setGame(game, onShelf: shelf, false) }
                                }
                            }
                        }
                    }
                }
                .padding()
            }
        }
        .overlay {
            if shelf?.games.isEmpty == true {
                ContentUnavailableView("Empty shelf", systemImage: "square.dashed", description: Text("Add games from their page, or while logging them."))
            }
        }
        .background(Color.canvas)
        .navigationTitle(shelf?.name ?? "Shelf")
    }
}

private struct NewShelfSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var description = ""
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                TextField("Name", text: $name)
                TextField("Description (optional)", text: $description, axis: .vertical)
                    .lineLimit(2...5)
                if let error { ErrorBanner(message: error).listRowBackground(Color.clear) }
            }
            .canvasBackground()
            .navigationTitle("New shelf")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel", role: .cancel) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create", role: .confirm) {
                        saving = true
                        Task {
                            defer { saving = false }
                            do {
                                let d = description.trimmingCharacters(in: .whitespacesAndNewlines)
                                try await model.createShelf(name: name, description: d.isEmpty ? nil : d)
                                dismiss()
                            } catch {
                                self.error = error.localizedDescription
                            }
                        }
                    }
                    .disabled(saving || name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
        .presentationDetents([.medium])
    }
}
