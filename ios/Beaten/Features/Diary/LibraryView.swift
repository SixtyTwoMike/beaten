import SwiftUI

// Your diary and your shelves, under one tab: the tab bar holds four tabs
// and search before the rest spill into "More".
struct LibraryView: View {
    enum Section: String, CaseIterable, Identifiable {
        case diary, shelves
        var id: String { rawValue }
        var label: String { self == .diary ? "Diary" : "Shelves" }
    }

    @State private var section: Section = .diary

    var body: some View {
        Group {
            switch section {
            case .diary: DiaryView()
            case .shelves: ShelvesView()
            }
        }
        .toolbar {
            ToolbarItem(placement: .principal) {
                Picker("Show", selection: $section) {
                    ForEach(Section.allCases) { Text($0.label).tag($0) }
                }
                .pickerStyle(.segmented)
                .frame(width: 200)
            }
        }
        .navigationBarTitleDisplayMode(.inline)
    }
}
