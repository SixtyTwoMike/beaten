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
    @Environment(AppModel.self) private var model
    enum TabID: Hashable { case home, library, activity, profile, search }
    @State private var tab: TabID = .home

    var body: some View {
        TabView(selection: $tab) {
            Tab("Home", systemImage: "house", value: .home) {
                NavigationStack { HomeView(showSearch: { tab = .search }) }
            }
            Tab("Library", systemImage: "books.vertical", value: .library) {
                NavigationStack { LibraryView() }
            }
            Tab("Activity", systemImage: "person.2", value: .activity) {
                NavigationStack { ActivityView() }
            }
            // Unread comments and reactions on your reviews.
            .badge(model.me?.social?.unreadNotifications ?? 0)
            Tab("Profile", systemImage: "person.crop.circle", value: .profile) {
                NavigationStack { ProfileView() }
            }
            // New followers since you last looked (the dot on the web's avatar).
            .badge(model.me?.social?.newFollowers ?? 0)
            Tab(value: .search, role: .search) {
                NavigationStack { SearchView() }
            }
        }
    }
}
