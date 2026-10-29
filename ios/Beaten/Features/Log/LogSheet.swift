import SwiftUI

// Log or edit an entry (the web's LogGameModal).
struct LogSheet: View {
    struct Target: Identifiable {
        let game: Game
        var status: PlayStatus
        var log: PlayLog?
        var id: String { log?.id ?? "new-\(game.igdbId)" }
    }

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let target: Target

    @State private var status: PlayStatus
    @State private var isReplay: Bool
    @State private var platformId: Int?
    @State private var startedAt: PartialDate?
    @State private var finishedAt: PartialDate?
    @State private var dateUnknown: Bool
    @State private var stoppedAt: PartialDate?
    @State private var notReturning: Bool
    @State private var rating: Int
    @State private var review: String
    @State private var spoilers: Bool
    @State private var shelfIds: Set<String> = []
    @State private var newShelfName = ""
    @State private var saving = false
    @State private var error: String?
    // Made once per sheet, so tapping Save again after a failure retries the
    // same create rather than making a second entry.
    @State private var newLogId = AppModel.newLogId()

    init(target: Target) {
        self.target = target
        let log = target.log
        let today = PartialDate(.now, precision: .day)
        _status = State(initialValue: log?.status ?? target.status)
        _isReplay = State(initialValue: log?.isReplay ?? false)
        _platformId = State(initialValue: log?.platformId)
        _startedAt = State(initialValue: log?.startedAt)
        _finishedAt = State(initialValue: log == nil ? today : log?.finishedAt ?? today)
        _dateUnknown = State(initialValue: log.map { $0.status.isFinished && $0.finishedAt == nil } ?? false)
        _stoppedAt = State(initialValue: log == nil ? today : log?.stoppedAt)
        _notReturning = State(initialValue: log?.notReturning ?? false)
        _rating = State(initialValue: log?.rating ?? 0)
        _review = State(initialValue: log?.reviewText ?? "")
        _spoilers = State(initialValue: log?.containsSpoilers ?? false)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack(spacing: 12) {
                        Poster(url: target.game.coverUrl, width: 44)
                        VStack(alignment: .leading) {
                            Text(target.game.name).font(.headline)
                            if let year = target.game.releaseYear {
                                Text(String(year)).font(.caption).foregroundStyle(Color.fog)
                            }
                        }
                    }
                    .listRowBackground(Color.clear)
                }

                Section("Status") {
                    Picker("Status", selection: $status) {
                        ForEach(PlayStatus.allCases) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
                    Picker("Play", selection: $isReplay) {
                        Text("First time").tag(false)
                        Text("Replay").tag(true)
                    }
                    platformPicker
                }

                Section("Dates") {
                    if !(status.isFinished && dateUnknown) {
                        PartialDateField(label: status == .playing ? "Playing since" : "Started", value: $startedAt, optional: true)
                    }
                    if status == .shelved {
                        PartialDateField(label: "Put down", value: $stoppedAt, optional: true)
                        Toggle("Not going back to it", isOn: $notReturning)
                    }
                    if status.isFinished {
                        if !dateUnknown {
                            PartialDateField(label: "Finished", value: $finishedAt, optional: false)
                        }
                        Toggle("I don't remember when I finished it", isOn: $dateUnknown)
                    }
                }

                Section("Rating") {
                    StarPicker(rating: $rating)
                }

                Section("Review") {
                    TextField("What did you think?", text: $review, axis: .vertical)
                        .lineLimit(4...12)
                    if !review.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        Toggle("Contains spoilers", isOn: $spoilers)
                    }
                }

                if target.log == nil { shelvesSection }

                if let error {
                    Section { ErrorBanner(message: error) }.listRowBackground(Color.clear)
                }
            }
            .canvasBackground()
            .navigationTitle(target.log == nil ? "Log game" : "Edit entry")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", role: .cancel) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if saving {
                        ProgressView()
                    } else {
                        Button("Save", role: .confirm, action: save)
                            .disabled(status.isFinished && !dateUnknown && finishedAt == nil)
                    }
                }
            }
            .interactiveDismissDisabled(saving)
        }
    }

    // This game's platforms first, then the rest.
    private var platformPicker: some View {
        let mine = Set(target.game.platformIds)
        let gamePlatforms = model.platforms.filter { mine.contains($0.id) }
        let others = model.platforms.filter { !mine.contains($0.id) }
        return Picker("Platform", selection: $platformId) {
            Text("Not set").tag(Int?.none)
            if !gamePlatforms.isEmpty {
                Section("This game's platforms") {
                    ForEach(gamePlatforms) { Text($0.name).tag(Int?.some($0.id)) }
                }
            }
            Section(gamePlatforms.isEmpty ? "Platforms" : "All platforms") {
                ForEach(others) { Text($0.name).tag(Int?.some($0.id)) }
            }
        }
        .pickerStyle(.navigationLink)
    }

    private var shelvesSection: some View {
        Section("Add to shelves") {
            ForEach(model.shelves) { shelf in
                Toggle(shelf.name, isOn: Binding(
                    get: { shelfIds.contains(shelf.id) },
                    set: { if $0 { shelfIds.insert(shelf.id) } else { shelfIds.remove(shelf.id) } }
                ))
            }
            TextField("New shelf name", text: $newShelfName)
        }
    }

    private func save() {
        let trimmedReview = review.trimmingCharacters(in: .whitespacesAndNewlines)
        let shelfName = newShelfName.trimmingCharacters(in: .whitespacesAndNewlines)
        let unknown = status.isFinished && dateUnknown
        let input = LogInput(
            id: target.log == nil ? newLogId : nil,
            igdbId: target.game.igdbId,
            status: status,
            platformId: platformId,
            startedAt: unknown ? nil : startedAt,
            finishedAt: status.isFinished && !unknown ? finishedAt : nil,
            finishedDateUnknown: unknown,
            stoppedAt: status == .shelved ? stoppedAt : nil,
            notReturning: status == .shelved && notReturning,
            isReplay: isReplay,
            rating: rating == 0 ? nil : rating,
            reviewText: trimmedReview.isEmpty ? nil : trimmedReview,
            containsSpoilers: !trimmedReview.isEmpty && spoilers,
            shelfIds: Array(shelfIds),
            newShelfName: shelfName.isEmpty ? nil : shelfName
        )
        saving = true
        error = nil
        Task {
            defer { saving = false }
            do {
                try await model.saveLog(input, logId: target.log?.id)
                dismiss()
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}

// A date that can be an exact day, a month or just a year.
struct PartialDateField: View {
    let label: String
    @Binding var value: PartialDate?
    let optional: Bool

    private static let years = Array((1970...Calendar.current.component(.year, from: .now)).reversed())

    var body: some View {
        if let current = value {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text(label)
                    Spacer()
                    Picker("Precision", selection: precision(current)) {
                        ForEach(PartialDate.Precision.allCases) { Text($0.label).tag($0) }
                    }
                    .labelsHidden()
                    .pickerStyle(.menu)
                    if optional {
                        Button { value = nil } label: {
                            Image(systemName: "xmark.circle.fill").foregroundStyle(Color.fog)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Clear \(label)")
                    }
                }
                switch current.precision {
                case .day:
                    DatePicker(label, selection: dayBinding(current), in: ...Date.now, displayedComponents: .date)
                        .labelsHidden()
                case .month:
                    HStack {
                        Picker("Month", selection: monthBinding(current)) {
                            ForEach(1...12, id: \.self) { Text(Calendar.current.monthSymbols[$0 - 1]).tag($0) }
                        }
                        yearPicker(current)
                    }
                    .labelsHidden()
                case .year:
                    yearPicker(current).labelsHidden()
                }
            }
        } else {
            Button { value = PartialDate(.now, precision: .day) } label: {
                HStack {
                    Text(label).foregroundStyle(.white)
                    Spacer()
                    Text("Add date").foregroundStyle(Color.mint)
                }
            }
        }
    }

    private func yearPicker(_ current: PartialDate) -> some View {
        Picker("Year", selection: Binding(
            get: { current.year },
            set: { value = PartialDate(year: $0, month: current.month, day: current.day) }
        )) {
            ForEach(Self.years, id: \.self) { Text(String($0)).tag($0) }
        }
    }

    private func precision(_ current: PartialDate) -> Binding<PartialDate.Precision> {
        Binding(
            get: { current.precision },
            set: { value = PartialDate(current.date, precision: $0) }
        )
    }

    private func dayBinding(_ current: PartialDate) -> Binding<Date> {
        Binding(get: { current.date }, set: { value = PartialDate($0, precision: .day) })
    }

    private func monthBinding(_ current: PartialDate) -> Binding<Int> {
        Binding(get: { current.month ?? 1 }, set: { value = PartialDate(year: current.year, month: $0) })
    }
}

// Half-star rating, 1–10 (0 = none). Tap or drag across the stars.
struct StarPicker: View {
    @Binding var rating: Int
    private let starSize: CGFloat = 30
    private let spacing: CGFloat = 6

    var body: some View {
        HStack {
            HStack(spacing: spacing) {
                ForEach(1...5, id: \.self) { star in
                    Image(systemName: rating >= star * 2 ? "star.fill" : rating == star * 2 - 1 ? "star.leadinghalf.filled" : "star")
                        .font(.system(size: starSize))
                        .foregroundStyle(rating >= star * 2 - 1 ? Color.mint : Color.fog.opacity(0.5))
                        .frame(width: starSize, height: starSize)
                }
            }
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 0).onChanged { g in
                let step = (starSize + spacing) / 2
                rating = min(10, max(1, Int((g.location.x / step).rounded(.up))))
            })
            .sensoryFeedback(.selection, trigger: rating)
            Spacer()
            if rating > 0 {
                Text(String(format: "%g", Double(rating) / 2)).monospacedDigit().foregroundStyle(Color.fog)
                Button("Clear") { rating = 0 }.font(.footnote).buttonStyle(.borderless)
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement()
        .accessibilityLabel("Rating")
        .accessibilityValue(rating == 0 ? "None" : String(format: "%g stars", Double(rating) / 2))
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: rating = min(10, rating + 1)
            case .decrement: rating = max(0, rating - 1)
            @unknown default: break
            }
        }
    }
}
