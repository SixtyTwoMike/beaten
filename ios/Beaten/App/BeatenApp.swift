import SwiftUI

@main
struct BeatenApp: App {
    @State private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .tint(.mint)
                .preferredColorScheme(.dark)
                .task { await model.launch() }
        }
    }
}

struct RootView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        switch model.phase {
        case .launching:
            Color.canvas.ignoresSafeArea().overlay { Logo(size: 28) }
        case .signedOut:
            SignInView()
        case .signedIn:
            MainTabs()
        }
    }
}

struct MainTabs: View {
    enum TabID: Hashable { case home, diary, shelves, profile, search }
    @State private var tab: TabID = .home

    var body: some View {
        TabView(selection: $tab) {
            Tab("Home", systemImage: "house", value: .home) {
                NavigationStack { HomeView(showSearch: { tab = .search }) }
            }
            Tab("Diary", systemImage: "book.closed", value: .diary) {
                NavigationStack { DiaryView() }
            }
            Tab("Shelves", systemImage: "books.vertical", value: .shelves) {
                NavigationStack { ShelvesView() }
            }
            Tab("Profile", systemImage: "person.crop.circle", value: .profile) {
                NavigationStack { ProfileView() }
            }
            Tab(value: .search, role: .search) {
                NavigationStack { SearchView() }
            }
        }
    }
}
