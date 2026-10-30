import SwiftUI

// Title, birth year (for ages) and the look: colour, background and road.
struct ChronicleStyleSheet: View {
    @Environment(\.dismiss) private var dismiss
    let model: ChronicleModel

    @State private var settings: ChronicleSettings
    @State private var birthYear: String
    @State private var saving = false
    @State private var error: String?

    init(model: ChronicleModel, chronicle: Chronicle) {
        self.model = model
        _settings = State(initialValue: ChronicleSettings(
            title: chronicle.title,
            birthYear: chronicle.birthYear,
            showAges: chronicle.showAges,
            accent: chronicle.accent,
            background: chronicle.background,
            path: chronicle.path
        ))
        _birthYear = State(initialValue: chronicle.birthYear.map(String.init) ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Title") {
                    TextField("My Console Chronicles", text: Binding(
                        get: { settings.title ?? "" },
                        set: { settings.title = String($0.prefix(40)) }
                    ))
                }

                Section {
                    LabeledContent("Year you were born") {
                        TextField("Optional", text: $birthYear)
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.trailing)
                    }
                    Toggle("Show my age for each console", isOn: $settings.showAges)
                } footer: {
                    Text("Only used to work out how old you were. It's never shown.")
                }

                Section("Colour") {
                    HStack(spacing: 14) {
                        ForEach(ChronicleAccent.allCases) { accent in
                            Button { settings.accent = accent } label: {
                                Circle()
                                    .fill(accent.color)
                                    .frame(width: 34, height: 34)
                                    .overlay {
                                        if settings.accent == accent {
                                            Circle().strokeBorder(Color.white, lineWidth: 3).padding(-5)
                                        }
                                    }
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(accent.rawValue.capitalized)
                            .accessibilityAddTraits(settings.accent == accent ? .isSelected : [])
                        }
                    }
                    .padding(.vertical, 6)
                }

                Section("Background") {
                    Picker("Background", selection: $settings.background) {
                        ForEach(ChronicleBackground.allCases) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.segmented)
                }

                Section("Road") {
                    Picker("Road", selection: $settings.path) {
                        ForEach(ChroniclePath.allCases) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.segmented)
                }

                if let error {
                    Section { ErrorBanner(message: error) }.listRowBackground(Color.clear)
                }
            }
            .canvasBackground()
            .navigationTitle("Style")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel", role: .cancel) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    if saving { ProgressView() } else { Button("Save", role: .confirm, action: save) }
                }
            }
        }
    }

    private func save() {
        var s = settings
        let typed = birthYear.trimmingCharacters(in: .whitespaces)
        s.birthYear = typed.isEmpty ? nil : Int(typed)
        if !typed.isEmpty && s.birthYear == nil {
            error = "Enter a year of birth like 1990"
            return
        }
        let title = (s.title ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        s.title = title.isEmpty ? nil : title
        saving = true
        error = nil
        Task {
            defer { saving = false }
            do {
                try await model.saveSettings(s)
                dismiss()
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}
