import SwiftUI

// Add or edit one console: which one, when you got it, model, note, age
// and up to three games that defined it (the web editor's console form).
struct ConsoleSheet: View {
    struct Target: Identifiable {
        let stop: ChronicleStop?
        var id: String { stop?.id ?? "new" }
    }

    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let model: ChronicleModel
    let target: Target

    @State private var console: ConsoleOption?
    @State private var gotAt: PartialDate?
    @State private var modelName: String
    @State private var note: String
    @State private var age: Int?
    @State private var games: [ChronicleGame]
    @State private var picking = false
    @State private var findingGame = false
    @State private var saving = false
    @State private var deleting = false
    @State private var error: String?

    private static let maxGames = 3

    init(model: ChronicleModel, target: Target) {
        self.model = model
        self.target = target
        let stop = target.stop
        _console = State(initialValue: stop.flatMap { model.option(for: $0) })
        _gotAt = State(initialValue: stop?.gotAt ?? PartialDate(year: Calendar.current.component(.year, from: .now)))
        _modelName = State(initialValue: stop?.model ?? "")
        _note = State(initialValue: stop?.note ?? "")
        _age = State(initialValue: stop?.ageTyped)
        _games = State(initialValue: stop?.games ?? [])
    }

    private var suggestions: [Game] {
        guard let console else { return [] }
        let chosen = Set(games.map(\.igdbId))
        return (model.suggestions[console.platformId] ?? []).filter { !chosen.contains($0.igdbId) }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Button { picking = true } label: {
                        HStack(spacing: 12) {
                            ConsoleArtView(art: console?.art, name: console?.name ?? "")
                                .frame(width: 56, height: 40)
                                .opacity(console == nil ? 0 : 1)
                            Text(console?.name ?? "Choose a console")
                                .foregroundStyle(console == nil ? Color.mint : .white)
                            Spacer()
                            Image(systemName: "chevron.right").font(.footnote).foregroundStyle(Color.fog)
                        }
                    }
                }

                Section("When you got it") {
                    PartialDateField(label: "Got it", value: $gotAt, optional: false)
                    Stepper(value: Binding(get: { age ?? -1 }, set: { age = $0 < 0 ? nil : $0 }), in: -1...120) {
                        HStack {
                            Text("Age")
                            Spacer()
                            Text(age.map(String.init) ?? "From birth year").foregroundStyle(Color.fog)
                        }
                    }
                }

                Section {
                    TextField("Model (Slim, Lite, launch edition…)", text: $modelName)
                        .onChange(of: modelName) { modelName = String(modelName.prefix(30)) }
                    TextField("A note — \u{201C}Christmas 1998\u{201D}", text: $note, axis: .vertical)
                        .lineLimit(1...3)
                        .onChange(of: note) { note = String(note.prefix(80)) }
                }

                Section {
                    ForEach(games) { game in
                        HStack(spacing: 12) {
                            Poster(url: game.coverUrl, width: 32)
                            Text(game.name)
                        }
                    }
                    .onDelete { games.remove(atOffsets: $0) }
                    .onMove { games.move(fromOffsets: $0, toOffset: $1) }
                    if games.count < Self.maxGames {
                        ForEach(suggestions.prefix(6)) { game in
                            Button { add(game) } label: {
                                HStack(spacing: 12) {
                                    Poster(url: game.coverUrl, width: 32)
                                    Text(game.name).foregroundStyle(.white)
                                    Spacer()
                                    Image(systemName: "plus.circle.fill").foregroundStyle(Color.mint)
                                }
                            }
                        }
                        Button("Find a game", systemImage: "magnifyingglass") { findingGame = true }
                    }
                } header: {
                    Text("Games that defined it (\(games.count)/\(Self.maxGames))")
                } footer: {
                    if !suggestions.isEmpty, games.count < Self.maxGames {
                        Text("Suggested from your diary.")
                    }
                }

                if target.stop != nil {
                    Section {
                        Button("Remove console", role: .destructive) { deleting = true }
                    }
                }
                if let error {
                    Section { ErrorBanner(message: error) }.listRowBackground(Color.clear)
                }
            }
            .canvasBackground()
            .navigationTitle(target.stop == nil ? "Add console" : "Edit console")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel", role: .cancel) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    if saving {
                        ProgressView()
                    } else {
                        Button("Save", role: .confirm, action: save).disabled(console == nil || gotAt == nil)
                    }
                }
            }
            .sheet(isPresented: $picking) {
                ConsolePicker(consoles: model.consoles) { console = $0 }
            }
            .sheet(isPresented: $findingGame) {
                GameFinder(platformId: console?.platformId) { add($0) }
            }
            .confirmationDialog("Remove \(console?.name ?? "this console")?", isPresented: $deleting, titleVisibility: .visible) {
                Button("Remove", role: .destructive) {
                    guard let stop = target.stop else { return }
                    Task {
                        do {
                            try await model.deleteConsole(stop)
                            dismiss()
                        } catch {
                            self.error = error.localizedDescription
                        }
                    }
                }
            }
            .interactiveDismissDisabled(saving)
        }
    }

    private func add(_ game: Game) {
        guard games.count < Self.maxGames, !games.contains(where: { $0.igdbId == game.igdbId }) else { return }
        games.append(ChronicleGame(igdbId: game.igdbId, name: game.name, coverUrl: game.coverUrl))
    }

    private func save() {
        guard let console, let gotAt else { return }
        let trimmedModel = modelName.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedNote = note.trimmingCharacters(in: .whitespacesAndNewlines)
        let input = ConsoleInput(
            platformId: console.platformId,
            variant: console.variant,
            model: trimmedModel.isEmpty ? nil : trimmedModel,
            gotAt: gotAt,
            age: age,
            note: trimmedNote.isEmpty ? nil : trimmedNote,
            games: games.map(\.igdbId)
        )
        saving = true
        error = nil
        Task {
            defer { saving = false }
            do {
                try await model.saveConsole(input, id: target.stop?.id)
                dismiss()
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}

// Searchable list of consoles, best-sellers first.
private struct ConsolePicker: View {
    @Environment(\.dismiss) private var dismiss
    let consoles: [ConsoleOption]
    let onPick: (ConsoleOption) -> Void
    @State private var query = ""

    var body: some View {
        NavigationStack {
            List {
                let matches = consoles.filter { $0.matches(query) }
                let popular = matches.filter(\.popular)
                let others = matches.filter { !$0.popular }
                if !popular.isEmpty {
                    Section(query.isEmpty ? "Popular" : "Best sellers") { rows(popular) }
                }
                if !others.isEmpty {
                    Section(popular.isEmpty ? "Consoles" : "More") { rows(others) }
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .canvasBackground()
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Console or computer")
            .navigationTitle("Choose a console")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel", role: .cancel) { dismiss() } }
            }
            .overlay {
                if consoles.isEmpty { ProgressView() }
            }
        }
    }

    private func rows(_ list: [ConsoleOption]) -> some View {
        ForEach(list) { console in
            Button {
                onPick(console)
                dismiss()
            } label: {
                HStack(spacing: 12) {
                    AsyncImage(url: console.thumb) { $0.resizable().scaledToFit() } placeholder: { Color.clear }
                        .frame(width: 44, height: 30)
                    Text(console.name).foregroundStyle(.white)
                }
            }
        }
    }
}

// Game search for a console's favourites, the console's own games first.
private struct GameFinder: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let platformId: Int?
    let onPick: (Game) -> Void
    @State private var query = ""
    @State private var results: [Game] = []
    @State private var error: String?

    var body: some View {
        NavigationStack {
            List(results) { game in
                Button {
                    onPick(game)
                    dismiss()
                } label: {
                    HStack(spacing: 12) {
                        Poster(url: game.coverUrl, width: 36)
                        VStack(alignment: .leading) {
                            Text(game.name).foregroundStyle(.white)
                            if let year = game.releaseYear {
                                Text(String(year)).font(.caption).foregroundStyle(Color.fog)
                            }
                        }
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .canvasBackground()
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search games")
            .navigationTitle("Find a game")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel", role: .cancel) { dismiss() } }
            }
            .overlay {
                if let error { ErrorBanner(message: error).padding() }
            }
            .task(id: query) {
                let q = query.trimmingCharacters(in: .whitespaces)
                guard q.count >= 2 else { results = []; return }
                try? await Task.sleep(for: .milliseconds(350))
                guard !Task.isCancelled else { return }
                do {
                    results = try await app.search(q, platformId: platformId)
                    error = nil
                } catch is CancellationError {
                } catch {
                    self.error = error.localizedDescription
                }
            }
        }
    }
}
