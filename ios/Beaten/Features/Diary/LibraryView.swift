import SwiftUI

// Your diary, shelves, Pull List and (once it's turned on) collection, under
// one tab: the tab bar holds four tabs and search before the rest spill into
// "More".
struct LibraryView: View {
    enum Section: String, CaseIterable, Identifiable {
        case diary, shelves, pull, collection
        var id: String { rawValue }
        var label: String {
            switch self {
            case .diary: "Diary"
            case .shelves: "Shelves"
            case .pull: "Pull List"
            case .collection: "Collection"
            }
        }
    }

    @Environment(AppModel.self) private var model
    @State private var section: Section = .diary

    // The collection is opt-in, so its segment only appears once it's on.
    private var sections: [Section] {
        model.collection.enabled ? Section.allCases : Section.allCases.filter { $0 != .collection }
    }

    var body: some View {
        Group {
            switch section {
            case .diary: DiaryView()
            case .shelves: ShelvesView()
            case .pull: PullListView()
            case .collection: CollectionView()
            }
        }
        .toolbar {
            ToolbarItem(placement: .principal) {
                Picker("Show", selection: $section) {
                    ForEach(sections) { Text($0.label).tag($0) }
                }
                .pickerStyle(.segmented)
                .frame(width: sections.count > 3 ? 320 : 250)
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: model.collection.enabled) { if !model.collection.enabled, section == .collection { section = .diary } }
    }
}
