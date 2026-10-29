import SwiftUI

// Every entry, grouped as on the web diary: playing and finished first (by
// finish date), then finished on an unknown date, then shelved.
struct DiaryView: View {
    @Environment(AppModel.self) private var model
    @State private var status: PlayStatus?
    @State private var platformId: Int?
    @State private var year: Int?
    @State private var editing: LogSheet.Target?
    @State private var deleting: PlayLog?
    @State private var error: String?

    private var filtered: [PlayLog] {
        model.logs.filter { log in
            (status == nil || log.status == status)
                && (platformId == nil || log.platformId == platformId)
                && (year == nil || log.finishedAt?.year == year)
        }
    }

    private var years: [Int] {
        Array(Set(model.logs.compactMap { $0.finishedAt?.year })).sorted(by: >)
    }

    private var usedPlatforms: [Platform] {
        let ids = Set(model.logs.compactMap(\.platformId))
        return model.platforms.filter { ids.contains($0.id) }
    }

    private var groups: [(title: String?, logs: [PlayLog])] {
        let logs = filtered
        let undated = logs.filter { $0.status.isFinished && $0.finishedAt == nil }
            .sorted { ($0.game?.name ?? "") < ($1.game?.name ?? "") }
        let shelved = logs.filter { $0.status == .shelved }
            .sorted { ($0.stoppedAt?.date ?? $0.updatedAt) > ($1.stoppedAt?.date ?? $1.updatedAt) }
        let main = logs.filter { !($0.status.isFinished && $0.finishedAt == nil) && $0.status != .shelved }
            .sorted { a, b in
                switch (a.finishedAt, b.finishedAt) {
                case (nil, nil): (a.startedAt?.date ?? a.createdAt) > (b.startedAt?.date ?? b.createdAt)
                case (nil, _): true
                case (_, nil): false
                case let (af?, bf?): af == bf ? a.createdAt > b.createdAt : af > bf
                }
            }
        return [(nil, main), ("Finished, date unknown", undated), ("Shelved", shelved)].filter { !$0.logs.isEmpty }
    }

    var body: some View {
        List {
            if let error { ErrorBanner(message: error).listRowBackground(Color.clear) }
            ForEach(groups, id: \.title) { group in
                Section {
                    ForEach(group.logs) { log in
                        LogRow(log: log)
                            .listRowBackground(Color.canvas)
                            .swipeActions(edge: .trailing) {
                                Button("Delete", systemImage: "trash", role: .destructive) { deleting = log }
                                Button("Edit", systemImage: "pencil") {
                                    if let game = log.game { editing = .init(game: game, status: log.status, log: log) }
                                }
                                .tint(.sky)
                            }
                    }
                } header: {
                    if let title = group.title { SectionTitle(title) }
                }
            }
        }
        .listStyle(.plain)
        .canvasBackground()
        .overlay {
            if model.logs.isEmpty {
                ContentUnavailableView("No entries yet", systemImage: "book.closed", description: Text("Search for a game and log it to start your diary."))
            } else if filtered.isEmpty {
                ContentUnavailableView("Nothing matches", systemImage: "line.3.horizontal.decrease.circle", description: Text("Try other filters."))
            }
        }
        .navigationTitle("Diary")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) { filterMenu }
        }
        .refreshable { await model.refresh() }
        .sheet(item: $editing) { LogSheet(target: $0) }
        .confirmationDialog("Delete this entry?", isPresented: .init(get: { deleting != nil }, set: { if !$0 { deleting = nil } }), titleVisibility: .visible) {
            Button("Delete", role: .destructive) {
                guard let log = deleting else { return }
                Task {
                    do { try await model.deleteLog(log) } catch { self.error = error.localizedDescription }
                }
            }
        }
        .gameDestinations()
    }

    private var filtering: Bool { status != nil || platformId != nil || year != nil }

    private var filterMenu: some View {
        Menu {
            Picker("Status", selection: $status) {
                Text("All statuses").tag(PlayStatus?.none)
                ForEach(PlayStatus.allCases) { Label($0.label, systemImage: $0.symbol).tag(PlayStatus?.some($0)) }
            }
            .pickerStyle(.menu)
            Picker("Platform", selection: $platformId) {
                Text("All platforms").tag(Int?.none)
                ForEach(usedPlatforms) { Text($0.name).tag(Int?.some($0.id)) }
            }
            .pickerStyle(.menu)
            Picker("Year finished", selection: $year) {
                Text("Any year").tag(Int?.none)
                ForEach(years, id: \.self) { Text(String($0)).tag(Int?.some($0)) }
            }
            .pickerStyle(.menu)
            if filtering {
                Button("Clear filters", systemImage: "xmark") {
                    status = nil
                    platformId = nil
                    year = nil
                }
            }
        } label: {
            Image(systemName: filtering ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease.circle")
        }
        .accessibilityLabel("Filter")
    }
}
