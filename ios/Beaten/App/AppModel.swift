import Foundation
import Observation
import UIKit

// The signed-in session and everything loaded for it. Views read the diary,
// shelves and platforms from here and call its methods to change them; each
// change goes to the server first, then updates the local copy from the
// server's answer.
@Observable
final class AppModel {
    enum Phase { case launching, signedOut, signedIn }

    private(set) var phase: Phase = .launching
    private(set) var me: Me?
    private(set) var logs: [PlayLog] = []
    private(set) var shelves: [Shelf] = []
    private(set) var platforms: [Platform] = []
    private(set) var loadError: String?

    let api = APIClient()

    init() {
        api.onUnauthorized = { [weak self] in self?.signedOut() }
    }

    // MARK: Session

    func launch() async {
        guard phase == .launching else { return }
        guard let token = Keychain.load() else {
            phase = .signedOut
            return
        }
        api.token = token
        phase = .signedIn
        await refresh()
    }

    nonisolated private struct SignInResponse: Decodable {
        let token: String
        let me: Me
    }

    private var deviceName: String { UIDevice.current.name }

    func signIn(email: String, password: String) async throws {
        struct Body: Encodable { let email, password, deviceName: String }
        let res: SignInResponse = try await api.send(
            "POST", "/auth/login", body: Body(email: email, password: password, deviceName: deviceName)
        )
        await signedIn(res)
    }

    func signInWithApple(identityToken: String, nonce: String, name: String?) async throws {
        struct Body: Encodable { let identityToken, nonce: String; let name: String?; let deviceName: String }
        let res: SignInResponse = try await api.send(
            "POST", "/auth/apple",
            body: Body(identityToken: identityToken, nonce: nonce, name: name, deviceName: deviceName)
        )
        await signedIn(res)
    }

    private func signedIn(_ res: SignInResponse) async {
        Keychain.save(res.token)
        api.token = res.token
        me = res.me
        phase = .signedIn
        await refresh()
    }

    func signOut() async {
        try? await api.send("POST", "/auth/logout")
        signedOut()
    }

    // Also called when the server says the token is no longer valid.
    private func signedOut() {
        Keychain.clear()
        api.token = nil
        me = nil
        logs = []
        shelves = []
        phase = .signedOut
    }

    func deleteAccount(confirmation: String) async throws {
        struct Body: Encodable { let confirmation: String }
        try await api.send("DELETE", "/account", body: Body(confirmation: confirmation))
        signedOut()
    }

    // MARK: Loading

    nonisolated private struct LogsResponse: Decodable { let logs: [PlayLog] }
    nonisolated private struct ShelvesResponse: Decodable { let shelves: [Shelf] }
    nonisolated private struct PlatformsResponse: Decodable { let platforms: [Platform] }

    func refresh() async {
        do {
            async let me: Me = api.get("/me")
            async let logs: LogsResponse = api.get("/logs")
            async let shelves: ShelvesResponse = api.get("/shelves")
            (self.me, self.logs, self.shelves) = try await (me, logs.logs, shelves.shelves)
            loadError = nil
        } catch is CancellationError {
        } catch {
            loadError = error.localizedDescription
        }
        if platforms.isEmpty {
            platforms = (try? await api.get("/platforms") as PlatformsResponse)?.platforms ?? []
        }
    }

    func refreshMe() async {
        if let fresh: Me = try? await api.get("/me") { me = fresh }
    }

    private func refreshShelves() async {
        if let res: ShelvesResponse = try? await api.get("/shelves") { shelves = res.shelves }
    }

    // MARK: Diary

    nonisolated private struct LogResponse: Decodable { let log: PlayLog }

    // Creates or (with logId) replaces an entry.
    @discardableResult
    func saveLog(_ input: LogInput, logId: String? = nil) async throws -> PlayLog {
        var input = input
        let res: LogResponse
        if let logId {
            input.id = nil
            res = try await api.send("PATCH", "/logs/\(logId)", body: input)
        } else {
            // The app picks the id, so a retry after a dropped connection
            // finds this log instead of making another.
            if input.id == nil { input.id = Self.newLogId() }
            res = try await api.send("POST", "/logs", body: input)
        }
        logs.removeAll { $0.id == res.log.id }
        logs.insert(res.log, at: 0)
        if !input.shelfIds.isEmpty || input.newShelfName != nil { await refreshShelves() }
        await refreshMe()
        return res.log
    }

    func deleteLog(_ log: PlayLog) async throws {
        try await api.send("DELETE", "/logs/\(log.id)")
        logs.removeAll { $0.id == log.id }
        await refreshMe()
    }

    static func newLogId() -> String {
        UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
    }

    func platformName(_ id: Int?) -> String? {
        guard let id else { return nil }
        return platforms.first { $0.id == id }?.name
    }

    // MARK: Search and games

    nonisolated private struct SearchResponse: Decodable { let results: [Game] }

    func search(_ query: String, platformId: Int?) async throws -> [Game] {
        var q = ["q": query]
        if let platformId { q["platform"] = String(platformId) }
        let res: SearchResponse = try await api.get("/games/search", query: q)
        return res.results
    }

    func gameDetail(_ igdbId: Int) async throws -> GameDetail {
        try await api.get("/games/\(igdbId)")
    }

    // MARK: Shelves

    func createShelf(name: String, description: String?) async throws {
        struct Body: Encodable { let name: String; let description: String? }
        struct Res: Decodable { let shelf: Shelf }
        let res: Res = try await api.send("POST", "/shelves", body: Body(name: name, description: description))
        shelves.append(res.shelf)
        shelves.sort { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    func deleteShelf(_ shelf: Shelf) async throws {
        try await api.send("DELETE", "/shelves/\(shelf.id)")
        shelves.removeAll { $0.id == shelf.id }
    }

    func setGame(_ game: Game, onShelf shelf: Shelf, _ on: Bool) async throws {
        try await api.send(on ? "POST" : "DELETE", "/shelves/\(shelf.id)/games/\(game.igdbId)")
        await refreshShelves()
    }

    // MARK: Account

    nonisolated private struct DevicesResponse: Decodable { let devices: [Device] }

    func devices() async throws -> [Device] {
        let res: DevicesResponse = try await api.get("/devices")
        return res.devices
    }

    func signOutDevice(_ device: Device) async throws {
        try await api.send("DELETE", "/devices/\(device.id)")
    }

    // The JSON export, written to a temporary file for the share sheet.
    func exportFile() async throws -> URL {
        var request = URLRequest(url: APIClient.baseURL.appending(path: "api/v1/account/export"))
        request.setValue("Bearer \(api.token ?? "")", forHTTPHeaderField: "Authorization")
        let (data, response) = try await URLSession.shared.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw APIError.offline }
        let name = "beaten-\(me?.username ?? "account")-\(Date.now.formatted(.iso8601.year().month().day())).json"
        let url = FileManager.default.temporaryDirectory.appending(path: name)
        try data.write(to: url, options: .atomic)
        return url
    }
}
