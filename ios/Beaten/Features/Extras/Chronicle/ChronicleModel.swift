import Foundation
import Observation

// Your console chronicle, loaded from /api/v1/chronicle. Every write gets
// the whole chronicle back, since badges and ages depend on the other
// consoles.
@Observable
final class ChronicleModel {
    private(set) var chronicle: Chronicle?
    private(set) var suggestions: [Int: [Game]] = [:]
    private(set) var consoles: [ConsoleOption] = []
    private(set) var loadError: String?

    private let api: APIClient

    init(api: APIClient) {
        self.api = api
    }

    nonisolated private struct LoadResponse: Decodable {
        let chronicle: Chronicle
        let suggestions: [String: [Game]]
    }
    nonisolated private struct ChronicleResponse: Decodable { let chronicle: Chronicle }
    nonisolated private struct ConsolesResponse: Decodable { let consoles: [ConsoleOption] }

    func load() async {
        do {
            let res: LoadResponse = try await api.get("/chronicle")
            chronicle = res.chronicle
            suggestions = Dictionary(uniqueKeysWithValues: res.suggestions.compactMap { k, v in Int(k).map { ($0, v) } })
            loadError = nil
        } catch is CancellationError {
        } catch {
            loadError = error.localizedDescription
        }
        if consoles.isEmpty {
            consoles = (try? await api.get("/chronicle/consoles") as ConsolesResponse)?.consoles ?? []
        }
    }

    func saveSettings(_ settings: ChronicleSettings) async throws {
        let res: ChronicleResponse = try await api.send("PATCH", "/chronicle", body: settings)
        chronicle = res.chronicle
    }

    // Adds a console, or with id replaces it.
    func saveConsole(_ input: ConsoleInput, id: String?) async throws {
        let res: ChronicleResponse
        if let id {
            res = try await api.send("PATCH", "/chronicle/entries/\(id)", body: input)
        } else {
            res = try await api.send("POST", "/chronicle/entries", body: input)
        }
        chronicle = res.chronicle
    }

    func deleteConsole(_ stop: ChronicleStop) async throws {
        let res: ChronicleResponse = try await api.send("DELETE", "/chronicle/entries/\(stop.id)", body: Optional<String>.none)
        chronicle = res.chronicle
    }

    func option(for stop: ChronicleStop) -> ConsoleOption? {
        consoles.first { $0.platformId == stop.platformId && $0.variant == stop.variant }
    }
}
