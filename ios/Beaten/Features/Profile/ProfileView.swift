import SwiftUI

struct ProfileView: View {
    @Environment(AppModel.self) private var model
    @State private var exportURL: URL?
    @State private var exporting = false
    @State private var confirmSignOut = false
    @State private var deletingAccount = false
    @State private var error: String?

    private var profileURL: URL? {
        model.me?.username.map { APIClient.baseURL.appending(path: $0) }
    }

    var body: some View {
        List {
            if let me = model.me {
                Section {
                    HStack(spacing: 14) {
                        AvatarView(avatar: me.avatar, size: 64)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(me.name ?? me.username ?? "You").font(.title3.bold())
                            if let username = me.username {
                                Text("@\(username)").font(.subheadline).foregroundStyle(Color.fog)
                            }
                        }
                    }
                    .padding(.vertical, 6)
                    if let profileURL {
                        ShareLink(item: profileURL) { Label("Share your profile", systemImage: "square.and.arrow.up") }
                        Link(destination: profileURL) { Label("View on beaten.games", systemImage: "safari") }
                    }
                    Link(destination: APIClient.baseURL.appending(path: "settings")) {
                        Label("Edit profile on the web", systemImage: "person.text.rectangle")
                    }
                }
            }

            Section("Extras") {
                NavigationLink { ChronicleScreen() } label: {
                    Label("Console chronicles", systemImage: "point.bottomleft.forward.to.point.topright.scurvepath")
                }
            }

            Section("Account") {
                NavigationLink { DevicesView() } label: { Label("Signed-in devices", systemImage: "iphone") }
                Button {
                    exporting = true
                    Task {
                        defer { exporting = false }
                        do { exportURL = try await model.exportFile() } catch { self.error = error.localizedDescription }
                    }
                } label: {
                    HStack {
                        Label("Download my data", systemImage: "arrow.down.doc")
                        if exporting { Spacer(); ProgressView() }
                    }
                }
                .disabled(exporting)
                Button("Sign out", systemImage: "rectangle.portrait.and.arrow.right") { confirmSignOut = true }
                Button("Delete account", systemImage: "trash", role: .destructive) { deletingAccount = true }
            }

            Section("About") {
                Link("Support", destination: APIClient.baseURL.appending(path: "support"))
                Link("Privacy", destination: APIClient.baseURL.appending(path: "privacy"))
                Link("Terms of use", destination: APIClient.baseURL.appending(path: "terms"))
                Text("Game data from IGDB.com").font(.footnote).foregroundStyle(Color.fog)
            }

            if let error { ErrorBanner(message: error).listRowBackground(Color.clear) }
        }
        .canvasBackground()
        .navigationTitle("Profile")
        .confirmationDialog("Sign out of Beaten on this iPhone?", isPresented: $confirmSignOut, titleVisibility: .visible) {
            Button("Sign out", role: .destructive) { Task { await model.signOut() } }
        }
        .sheet(item: Binding(get: { exportURL.map(ExportFile.init) }, set: { if $0 == nil { exportURL = nil } })) { file in
            ShareSheet(items: [file.url])
        }
        .sheet(isPresented: $deletingAccount) { DeleteAccountSheet() }
    }

    private struct ExportFile: Identifiable {
        let url: URL
        var id: URL { url }
    }
}

// The profile picture: a crop of a game's cover or artwork, focal point x/y
// (in %) and zoom 1–3, as set on the web.
struct AvatarView: View {
    let avatar: Avatar?
    let size: CGFloat

    var body: some View {
        Group {
            if let avatar {
                AsyncImage(url: avatar.url) { image in
                    image.resizable().scaledToFill()
                        .frame(width: size * avatar.zoom, height: size * avatar.zoom)
                        .offset(
                            x: (0.5 - avatar.x / 100) * size * (avatar.zoom - 1),
                            y: (0.5 - avatar.y / 100) * size * (avatar.zoom - 1)
                        )
                } placeholder: { Color.card2 }
            } else {
                Color.card2.overlay {
                    Image(systemName: "person.fill").font(.system(size: size * 0.45)).foregroundStyle(Color.fog)
                }
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .accessibilityHidden(true)
    }
}

private struct DevicesView: View {
    @Environment(AppModel.self) private var model
    @State private var devices: [Device] = []
    @State private var error: String?

    var body: some View {
        List {
            if let error { ErrorBanner(message: error).listRowBackground(Color.clear) }
            Section {
                ForEach(devices) { device in
                    VStack(alignment: .leading, spacing: 3) {
                        HStack {
                            Text(device.name ?? "iPhone").font(.subheadline.weight(.semibold))
                            if device.current { Text("This device").font(.caption).foregroundStyle(Color.mint) }
                        }
                        Text("Last used \(device.lastUsedAt.formatted(.relative(presentation: .named)))")
                            .font(.caption)
                            .foregroundStyle(Color.fog)
                    }
                    .swipeActions {
                        if !device.current {
                            Button("Sign out", role: .destructive) {
                                Task {
                                    do {
                                        try await model.signOutDevice(device)
                                        devices.removeAll { $0.id == device.id }
                                    } catch { self.error = error.localizedDescription }
                                }
                            }
                        }
                    }
                }
            } footer: {
                Text("Swipe to sign out another device. \u{201C}Sign out everywhere\u{201D} on the web signs out the app too.")
            }
        }
        .canvasBackground()
        .navigationTitle("Signed-in devices")
        .task {
            do { devices = try await model.devices() } catch { self.error = error.localizedDescription }
        }
    }
}

private struct DeleteAccountSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var confirmation = ""
    @State private var deleting = false
    @State private var error: String?

    private var hasPassword: Bool { model.me?.hasPassword ?? true }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("This permanently deletes your account, diary, shelves and reviews. It can't be undone.")
                    if hasPassword {
                        SecureField("Password", text: $confirmation).textContentType(.password)
                    } else {
                        TextField("Your username or email", text: $confirmation)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                    }
                } footer: {
                    Text(hasPassword ? "Enter your password to confirm." : "Type your username or email to confirm.")
                }
                if let error { ErrorBanner(message: error).listRowBackground(Color.clear) }
                Section {
                    Button(role: .destructive) {
                        deleting = true
                        Task {
                            defer { deleting = false }
                            do { try await model.deleteAccount(confirmation: confirmation) } catch { self.error = error.localizedDescription }
                        }
                    } label: {
                        HStack {
                            Text("Delete my account")
                            if deleting { Spacer(); ProgressView() }
                        }
                    }
                    .disabled(deleting || confirmation.isEmpty)
                }
            }
            .canvasBackground()
            .navigationTitle("Delete account")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel", role: .cancel) { dismiss() } }
            }
        }
    }
}

// UIActivityViewController, for sharing the export as a file.
struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
