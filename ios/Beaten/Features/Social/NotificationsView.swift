import SwiftUI

// Comments and reactions on your reviews, newest first. Opening it marks
// them read (seen ones aren't emailed); each opens its review.
struct NotificationsView: View {
    @Environment(AppModel.self) private var model
    @State private var items: [AppNotification] = []
    @State private var more = false
    @State private var loaded = false
    @State private var error: String?

    nonisolated private struct Response: Decodable { let notifications: [AppNotification]; let more: Bool }

    var body: some View {
        List {
            if let error { ErrorBanner(message: error).listRowBackground(Color.clear) }
            if loaded && items.isEmpty {
                ContentUnavailableView(
                    "Nothing yet",
                    systemImage: "bell",
                    description: Text("When people react to or comment on your reviews, it shows up here.")
                )
                .listRowBackground(Color.clear)
            }
            ForEach(items) { n in
                NavigationLink { ReviewScreen(logId: n.logId) } label: { row(n) }
                    .listRowBackground(n.read ? Color.card : Color.mint.opacity(0.08))
            }
            if more, let last = items.last {
                ProgressView().frame(maxWidth: .infinity).task(id: last.id) { await load(before: last.createdAt) }
            }
        }
        .canvasBackground()
        .navigationTitle("Notifications")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                NavigationLink { NotificationSettingsView() } label: { Label("Email settings", systemImage: "gearshape") }
            }
        }
        .task { if !loaded { await load(before: nil) } }
        .refreshable { await load(before: nil) }
    }

    private func row(_ n: AppNotification) -> some View {
        HStack(spacing: 12) {
            PersonAvatar(person: n.actor, size: 36)
            VStack(alignment: .leading, spacing: 3) {
                Text(n.text).font(.subheadline).foregroundStyle(n.read ? Color.fog : .white).lineLimit(4)
                Text(n.createdAt.timeAgo).font(.caption).foregroundStyle(Color.fog.opacity(0.7))
            }
            Spacer(minLength: 0)
            Poster(url: n.game.coverUrl, width: 34)
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
    }

    private func load(before: Date?) async {
        do {
            var query: [String: String] = [:]
            if let before { query["before"] = before.ISO8601Format(.iso8601.year().month().day().time(includingFractionalSeconds: true)) }
            let res: Response = try await model.api.get("/notifications", query: query)
            items = before == nil ? res.notifications : items + res.notifications
            more = res.more
            loaded = true
            error = nil
            if before == nil, res.notifications.contains(where: { !$0.read }) {
                try? await model.api.send("POST", "/notifications/read")
                await model.refreshMe()
            }
        } catch is CancellationError {
        } catch {
            self.error = error.localizedDescription
            more = false
            loaded = true
        }
    }
}

// How often to email about comments and reactions (the same setting as the
// web's Settings > Notifications).
struct NotificationSettingsView: View {
    @Environment(AppModel.self) private var model
    @State private var settings: NotificationSettings?
    @State private var error: String?

    nonisolated private struct Response: Decodable { let settings: NotificationSettings }
    private struct Payload: Encodable { let comments: NotificationSettings.Frequency; let reactions: NotificationSettings.Frequency }

    var body: some View {
        Form {
            if let error { ErrorBanner(message: error).listRowBackground(Color.clear) }
            if let settings {
                Section {
                    picker("Comments", \.comments, settings)
                    picker("Reactions", \.reactions, settings)
                } header: {
                    Text("Email me about")
                } footer: {
                    Text("Everything also shows under Notifications. Ones you've already seen aren't emailed. Emails go to \(model.me?.email ?? "your account's address").")
                }
            } else {
                ProgressView().frame(maxWidth: .infinity)
            }
        }
        .canvasBackground()
        .navigationTitle("Notifications")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            do {
                let res: Response = try await model.api.get("/notifications/settings")
                settings = res.settings
            } catch is CancellationError {
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    private func picker(
        _ label: String,
        _ key: WritableKeyPath<NotificationSettings, NotificationSettings.Frequency>,
        _ current: NotificationSettings
    ) -> some View {
        Picker(label, selection: Binding(get: { settings?[keyPath: key] ?? current[keyPath: key] }, set: { save(key, $0) })) {
            ForEach(NotificationSettings.Frequency.allCases) { Text($0.label).tag($0) }
        }
    }

    private func save(_ key: WritableKeyPath<NotificationSettings, NotificationSettings.Frequency>, _ value: NotificationSettings.Frequency) {
        guard var next = settings else { return }
        let before = next
        next[keyPath: key] = value
        settings = next
        error = nil
        Task {
            do {
                let res: Response = try await model.api.send("PATCH", "/notifications/settings", body: Payload(comments: next.comments, reactions: next.reactions))
                settings = res.settings
            } catch {
                settings = before
                self.error = error.localizedDescription
            }
        }
    }
}
