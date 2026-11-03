import SwiftUI

// The physical games you own (docs/collection.md), separate from the diary.
// Shown in Library once the collection is turned on. Tap a copy to edit it;
// swipe to remove.
struct CollectionView: View {
    @Environment(AppModel.self) private var model
    @AppStorage("collectionSort") private var sort: CollectionSort = .platform
    @State private var adding = false
    @State private var editing: CollectionItemSheet.Target?
    @State private var error: String?

    private var items: [CollectionEntry] { model.collection.items }

    var body: some View {
        List {
            if let error { ErrorBanner(message: error).listRowBackground(Color.clear) }
            if !items.isEmpty {
                Text(summary).font(.footnote).foregroundStyle(Color.fog).listRowBackground(Color.clear)
            }
            ForEach(items.grouped(by: sort), id: \.label) { group in
                Section {
                    ForEach(group.entries) { row($0) }
                } header: {
                    if !group.label.isEmpty { Text("\(group.label) · \(group.entries.count)") }
                }
            }
        }
        .listStyle(.plain)
        .canvasBackground()
        .overlay {
            if items.isEmpty {
                ContentUnavailableView {
                    Label("Nothing in your collection", systemImage: "square.stack.3d.up")
                } description: {
                    Text("Add the games on your shelf: platform, region, loose or boxed. It's private unless you show it on your profile.")
                } actions: {
                    Button("Add a game") { adding = true }.buttonStyle(.borderedProminent)
                }
            }
        }
        .navigationTitle("Collection")
        .toolbar {
            // One item each side, so the Library switcher in the middle fits.
            ToolbarItem(placement: .topBarLeading) {
                Menu("Sort", systemImage: "arrow.up.arrow.down") {
                    Picker("Sort", selection: $sort) {
                        ForEach(CollectionSort.allCases) { Text($0.label).tag($0) }
                    }
                }
                .accessibilityIdentifier("collection-sort")
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button("Add a game you own", systemImage: "plus") { adding = true }
            }
        }
        .refreshable {
            do { try await model.refreshCollection() } catch { self.error = error.localizedDescription }
        }
        .sheet(isPresented: $adding) {
            AddToCollectionSheet { game in
                adding = false
                editing = .init(game: game, existing: nil)
            }
        }
        .sheet(item: $editing) { CollectionItemSheet(target: $0) }
    }

    private var summary: String {
        let platforms = Set(items.map(\.platformId)).count
        let boxed = items.filter { $0.completeness == "CIB" || $0.completeness == "SEALED" }.count
        var parts = ["\(items.count) \(items.count == 1 ? "copy" : "copies")", "\(platforms) \(platforms == 1 ? "platform" : "platforms")"]
        if boxed > 0 { parts.append("\(boxed * 100 / items.count)% boxed") }
        return parts.joined(separator: " · ")
    }

    private func row(_ entry: CollectionEntry) -> some View {
        Button { editing = .init(game: entry.game, existing: entry) } label: {
            HStack(spacing: 12) {
                Poster(url: entry.coverUrl, width: 40)
                VStack(alignment: .leading, spacing: 2) {
                    Text(entry.name).font(.subheadline.weight(.semibold)).foregroundStyle(.white).lineLimit(2)
                    let line = [sort == .platform ? nil : entry.platformName, entry.details.isEmpty ? nil : entry.details, entry.priceLabel]
                        .compactMap { $0 }
                        .joined(separator: " · ")
                    if !line.isEmpty { Text(line).font(.caption).foregroundStyle(Color.fog) }
                }
                Spacer()
            }
        }
        .accessibilityLabel("\(entry.name), \(entry.platformName)")
        .listRowBackground(Color.canvas)
        .swipeActions {
            Button("Remove", role: .destructive) {
                Task {
                    do { try await model.removeFromCollection(entry.id) } catch { self.error = error.localizedDescription }
                }
            }
        }
    }
}

// Pick a game to add; the details sheet follows.
private struct AddToCollectionSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let onPick: (Game) -> Void
    @State private var query = ""
    @State private var results: [Game] = []
    @State private var error: String?

    var body: some View {
        NavigationStack {
            List {
                TextField("Search for a game you own", text: $query)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(Color.card, in: .rect(cornerRadius: 10))
                    .listRowBackground(Color.canvas)
                    .listRowSeparator(.hidden)
                    .accessibilityIdentifier("collection-search")
                if let error { ErrorBanner(message: error).listRowBackground(Color.clear) }
                ForEach(results) { game in
                    HStack(spacing: 12) {
                        Poster(url: game.coverUrl, width: 40)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(game.name).font(.subheadline.weight(.semibold)).lineLimit(2)
                            if let year = game.releaseYear { Text(String(year)).font(.caption).foregroundStyle(Color.fog) }
                        }
                        Spacer()
                        Button("Add") { onPick(game) }
                            .buttonStyle(.borderedProminent)
                            .accessibilityLabel("Add \(game.name) to your collection")
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
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
        }
    }
}

// Add a copy of a game, or edit / remove one.
struct CollectionItemSheet: View {
    struct Target: Identifiable {
        let game: Game
        let existing: CollectionEntry?
        var id: String { existing?.id ?? "new-\(game.igdbId)" }
    }

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let target: Target

    @State private var platformId: Int?
    @State private var completeness: Completeness?
    @State private var region: Region?
    @State private var edition: String
    @State private var acquiredAt: PartialDate?
    @State private var currency: Currency
    @State private var price: String
    @State private var notes: String
    @State private var saving = false
    @State private var error: String?

    init(target: Target) {
        self.target = target
        let e = target.existing
        _platformId = State(initialValue: e?.platformId ?? (target.game.platformIds.count == 1 ? target.game.platformIds[0] : nil))
        _completeness = State(initialValue: e?.completeness.flatMap(Completeness.init(rawValue:)))
        _region = State(initialValue: e?.region.flatMap(Region.init(rawValue:)))
        _edition = State(initialValue: e?.edition ?? "")
        _acquiredAt = State(initialValue: e?.acquiredAt)
        let c = e?.currency.flatMap(Currency.init(rawValue:)) ?? .preferred
        _currency = State(initialValue: c)
        _price = State(initialValue: e?.pricePaid.map { c.text($0) } ?? "")
        _notes = State(initialValue: e?.notes ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack(spacing: 12) {
                        Poster(url: target.game.coverUrl, width: 44)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(target.game.name).font(.headline)
                            if let year = target.game.releaseYear { Text(String(year)).font(.caption).foregroundStyle(Color.fog) }
                        }
                    }
                    .listRowBackground(Color.clear)
                }
                Section {
                    platformPicker
                    Picker("What you have", selection: $completeness) {
                        Text("Not said").tag(Completeness?.none)
                        ForEach(Completeness.allCases) { Text($0.label).tag(Completeness?.some($0)) }
                    }
                    Picker("Region", selection: $region) {
                        Text("Not said").tag(Region?.none)
                        ForEach(Region.allCases) { Text($0.label).tag(Region?.some($0)) }
                    }
                    TextField("Edition (optional)", text: $edition)
                }
                Section {
                    PartialDateField(label: "Got it", value: $acquiredAt, optional: true)
                    HStack {
                        Picker("Paid", selection: $currency) {
                            ForEach(Currency.allCases) { Text("\($0.symbol) \($0.rawValue)").tag($0) }
                        }
                        TextField("0.00", text: $price)
                            .keyboardType(currency.digits == 0 ? .numberPad : .decimalPad)
                            .multilineTextAlignment(.trailing)
                            .frame(maxWidth: 110)
                            .accessibilityLabel("Price paid")
                    }
                    TextField("Notes (optional)", text: $notes, axis: .vertical)
                } footer: {
                    Text("What you paid and your notes are only ever shown to you.")
                }
                if let error {
                    Section { ErrorBanner(message: error) }.listRowBackground(Color.clear)
                }
                if let existing = target.existing {
                    Section {
                        Button("Remove from collection", role: .destructive) { remove(existing) }
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .canvasBackground()
            .navigationTitle(target.existing == nil ? "Add to collection" : "Your copy")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }.disabled(platformId == nil || saving)
                }
            }
        }
    }

    // This game's platforms first, then the rest.
    private var platformPicker: some View {
        let mine = Set(target.game.platformIds)
        let gamePlatforms = model.platforms.filter { mine.contains($0.id) }
        let others = model.platforms.filter { !mine.contains($0.id) }
        return Picker("Platform", selection: $platformId) {
            Text("Choose").tag(Int?.none)
            if !gamePlatforms.isEmpty {
                Section("This game's platforms") {
                    ForEach(gamePlatforms) { Text($0.name).tag(Int?.some($0.id)) }
                }
            }
            Section(gamePlatforms.isEmpty ? "Platforms" : "All platforms") {
                ForEach(others) { Text($0.name).tag(Int?.some($0.id)) }
            }
        }
    }

    private func save() {
        guard let platformId else { return }
        let input = CollectionInput(
            igdbId: target.existing == nil ? target.game.igdbId : nil,
            platformId: platformId,
            region: region?.rawValue ?? "",
            completeness: completeness?.rawValue ?? "",
            edition: edition.trimmingCharacters(in: .whitespacesAndNewlines),
            acquiredAt: acquiredAt,
            pricePaid: price.trimmingCharacters(in: .whitespaces),
            currency: currency.rawValue,
            notes: notes.trimmingCharacters(in: .whitespacesAndNewlines)
        )
        saving = true
        error = nil
        Task {
            defer { saving = false }
            do {
                if let existing = target.existing {
                    try await model.updateCollectionItem(existing.id, input)
                } else {
                    try await model.addToCollection(input)
                }
                dismiss()
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    private func remove(_ existing: CollectionEntry) {
        Task {
            do {
                try await model.removeFromCollection(existing.id)
                dismiss()
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}
