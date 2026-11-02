import SwiftUI

// Your diary, shelves and Pull List, under one tab: the tab bar holds four
// tabs and search before the rest spill into "More".
struct LibraryView: View {
    enum Section: String, CaseIterable, Identifiable {
        case diary, shelves, pull
        var id: String { rawValue }
        var label: String {
            switch self {
            case .diary: "Diary"
            case .shelves: "Shelves"
            case .pull: "Pull List"
            }
        }
    }

    @State private var section: Section = .diary

    var body: some View {
        Group {
            switch section {
            case .diary: DiaryView()
            case .shelves: ShelvesView()
            case .pull: PullListView()
            }
        }
        .toolbar {
            ToolbarItem(placement: .principal) {
                Picker("Show", selection: $section) {
                    ForEach(Section.allCases) { Text($0.label).tag($0) }
                }
                .pickerStyle(.segmented)
                .frame(width: 250)
            }
        }
        .navigationBarTitleDisplayMode(.inline)
    }
}
