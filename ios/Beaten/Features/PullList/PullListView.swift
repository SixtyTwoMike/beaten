import SwiftUI

// The Pull List: games you're interested in, in your order. Sort and filter
// from the menu; in "My order" with no genre filter, Edit lets you drag
// games into a new order (saved straight away). Swipe to remove. Games
// leave the list when you log them.
struct PullListView: View {
    @Environment(AppModel.self) private var model
    @AppStorage("pullListSort") private var sort: PullSort = .order
    @State private var genre: String?
    @State private var adding = false
    @State private var syncing = false
    @State private var notice: String?
    @State private var error: String?
    @State private var editMode: EditMode = .inactive

    private var items: [PullEntry] { model.pullList.items }
    private var activeGenre: String? { genre.flatMap { items.genres.contains($0) ? $0 : nil } }
    private var canReorder: Bool { sort == .order && activeGenre == nil }

    var body: some View {
        List {
            if let notice {
                Text(notice).font(.footnote).foregroundStyle(Color.mint).listRowBackground(Color.clear)
            }
            if let error { ErrorBanner(message: error).listRowBackground(Color.clear) }
            ForEach(items.grouped(by: sort, genre: activeGenre)) { group in
                section(group)
            }
        }
        .listStyle(.plain)
        .canvasBackground()
        .environment(\.editMode, $editMode)
        .overlay {
            if items.isEmpty {
                ContentUnavailableView {
                    Label("Nothing on your Pull List", systemImage: "list.star")
                } description: {
                    Text(emptyText)
                } actions: {
                    Button("Add a game") { adding = true }.buttonStyle(.borderedProminent)
                }
            }
        }
        .navigationTitle("Pull List")
        .toolbar {
            // One item each side, so the Diary / Shelves / Pull List switcher
            // in the middle has room.
            ToolbarItem(placement: .topBarLeading) { optionsMenu }
            ToolbarItem(placement: .topBarTrailing) {
                if editMode.isEditing {
                    Button("Done") { withAnimation { editMode = .inactive } }
                } else {
                    Button("Add a game", systemImage: "plus") { adding = true }
                }
            }
        }
        .onChange(of: canReorder) { if !canReorder { editMode = .inactive } }
        .refreshable {
            do { try await model.refreshPullList() } catch { self.error = error.localizedDescription }
        }
        .sheet(isPresented: $adding) { AddToPullSheet() }
        .gameDestinations()
    }

    private func section(_ group: PullGroup) -> some View {
        Section {
            ForEach(group.entries) { entry in
                row(entry)
            }
            .onMove(perform: moveAction)
        } header: {
            if let title = group.title {
                Text("\(title) · \(group.entries.count)")
            }
        }
    }

    private func row(_ entry: PullEntry) -> some View {
        let rank: Int? = canReorder ? (items.firstIndex(of: entry) ?? 0) + 1 : nil
        return NavigationLink(value: entry.game) {
            PullRow(entry: entry, rank: rank)
        }
        .listRowBackground(Color.canvas)
        .swipeActions {
            Button("Remove", systemImage: "trash", role: .destructive) { remove(entry) }
        }
    }

    private var moveAction: ((IndexSet, Int) -> Void)? {
        canReorder ? { move($0, $1) } : nil
    }

    private var emptyText: String {
        model.pullList.steamLinked
            ? "Add games you've got your eye on, or bring in your Steam wishlist."
            : "Add games you've got your eye on. Link Steam on beaten.games to bring in your wishlist."
    }

    private var optionsMenu: some View {
        Menu {
            Picker("Sort by", selection: $sort) {
                ForEach(PullSort.allCases) { Text($0.label).tag($0) }
            }
            if !items.genres.isEmpty {
                Picker("Genre", selection: $genre) {
                    Text("All genres").tag(String?.none)
                    ForEach(items.genres, id: \.self) { Text($0).tag(String?.some($0)) }
                }
                .pickerStyle(.menu)
            }
            if canReorder && items.count > 1 {
                Divider()
                Button("Reorder", systemImage: "arrow.up.arrow.down") { withAnimation { editMode = .active } }
            }
            if model.pullList.steamLinked {
                Divider()
                Button("Bring in my Steam wishlist", systemImage: "arrow.down.circle") { syncWishlist() }
                    .disabled(syncing)
            }
        } label: {
            Label("Sort and filter", systemImage: activeGenre == nil && sort == .order ? "line.3.horizontal.decrease.circle" : "line.3.horizontal.decrease.circle.fill")
        }
        .accessibilityIdentifier("pull-options")
    }

    private func move(_ from: IndexSet, _ to: Int) {
        var next = items
        next.move(fromOffsets: from, toOffset: to)
        error = nil
        Task {
            do { try await model.reorderPullList(next) } catch { self.error = error.localizedDescription }
        }
    }

    private func remove(_ entry: PullEntry) {
        error = nil
        Task {
            do { try await model.removeFromPullList(entry.igdbId) } catch { self.error = error.localizedDescription }
        }
    }

    private func syncWishlist() {
        syncing = true
        error = nil
        notice = nil
        Task {
            defer { syncing = false }
            do {
                let r = try await model.importSteamWishlist()
                if r.empty {
                    notice = "Your Steam wishlist came back empty. If it isn't, set it to public in Steam's privacy settings."
                } else {
                    notice = (r.added > 0 ? "Added \(r.added) game\(r.added == 1 ? "" : "s")" : "Nothing new") + " from your wishlist"
                        + (r.unmatched > 0 ? " · \(r.unmatched) we couldn't match" : "")
                }
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}

private struct PullRow: View {
    let entry: PullEntry
    let rank: Int?

    var body: some View {
        HStack(spacing: 12) {
            if let rank {
                Text("\(rank)").font(.subheadline.monospacedDigit()).foregroundStyle(Color.fog).frame(minWidth: 20, alignment: .trailing)
            }
            Poster(url: entry.coverUrl, width: 44)
            VStack(alignment: .leading, spacing: 4) {
                Text(entry.name).font(.subheadline.weight(.semibold)).lineLimit(2)
                HStack(spacing: 6) {
                    releaseBadge
                    if !entry.genres.isEmpty {
                        Text(entry.genres.prefix(2).joined(separator: ", ")).lineLimit(1)
                    }
                }
                .font(.caption)
                .foregroundStyle(Color.fog)
                if entry.fromSteam {
                    Text("From Steam wishlist").font(.caption2).foregroundStyle(Color.fog.opacity(0.7))
                }
            }
        }
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder private var releaseBadge: some View {
        switch entry.release() {
        case .tba:
            Text("TBA").padding(.horizontal, 5).padding(.vertical, 1).background(Color.edge, in: .rect(cornerRadius: 4))
        case .upcoming:
            Text("Out \(entry.releaseLabel ?? "")").foregroundStyle(Color.gold)
                .padding(.horizontal, 5).padding(.vertical, 1).background(Color.gold.opacity(0.15), in: .rect(cornerRadius: 4))
        case .out:
            Text(entry.releaseLabel ?? "")
        }
    }
}

// Game search with an Add button on each result.
private struct AddToPullSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var results: [Game] = []
    @State private var busy: Int?
    @State private var error: String?

    var body: some View {
        NavigationStack {
            List {
                // A plain field rather than .searchable, which hides Done
                // while the search is active.
                TextField("Search for a game", text: $query)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(Color.card, in: .rect(cornerRadius: 10))
                    .listRowBackground(Color.canvas)
                    .listRowSeparator(.hidden)
                    .accessibilityIdentifier("pull-search")
                if let error { ErrorBanner(message: error).listRowBackground(Color.clear) }
                ForEach(results) { game in
                    let on = model.pullList.items.contains { $0.igdbId == game.igdbId }
                    HStack(spacing: 12) {
                        Poster(url: game.coverUrl, width: 40)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(game.name).font(.subheadline.weight(.semibold)).lineLimit(2)
                            if let year = game.releaseYear { Text(String(year)).font(.caption).foregroundStyle(Color.fog) }
                        }
                        Spacer()
                        Button(on ? "On list" : "Add") { add(game) }
                            .buttonStyle(.borderedProminent)
                            .tint(on ? Color.edge : Color.mint)
                            .disabled(on || busy == game.igdbId)
                            .accessibilityLabel(on ? "\(game.name) is on your Pull List" : "Add \(game.name) to your Pull List")
                    }
                    .listRowBackground(Color.canvas)
                }
            }
            .listStyle(.plain)
            .canvasBackground()
            .task(id: query) {
                let q = query.trimmingCharacters(in: .whitespaces)
                guard q.count >= 2 else { results = []; return }
                try? await Task.sleep(for: .milliseconds(300))
                guard !Task.isCancelled else { return }
                do {
                    results = try await model.search(q, platformId: nil)
                    error = nil
                } catch is CancellationError {
                } catch {
                    self.error = error.localizedDescription
                }
            }
            .navigationTitle("Add a game")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
        }
    }

    private func add(_ game: Game) {
        busy = game.igdbId
        error = nil
        Task {
            defer { busy = nil }
            do { try await model.addToPullList(game.igdbId) } catch { self.error = error.localizedDescription }
        }
    }
}
