import Foundation

struct APIError: LocalizedError {
    let status: Int
    let message: String
    var errorDescription: String? { message }

    static let offline = APIError(status: 0, message: "Couldn't reach Beaten. Check your connection and try again.")
}

// The JSON API at /api/v1 (src/app/api/v1 on the server). Every call sends
// the bearer token from the Keychain; a 401 means it was revoked or expired,
// and signs the app out.
final class APIClient {
    static let baseURL: URL = {
        let raw = Bundle.main.object(forInfoDictionaryKey: "BeatenAPIBase") as? String
        return URL(string: raw ?? "") ?? URL(string: "https://beaten.games")!
    }()

    var token: String?
    var onUnauthorized: (() -> Void)?

    private let session: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 20
        config.httpCookieStorage = nil
        config.httpShouldSetCookies = false
        return URLSession(configuration: config)
    }()

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .custom { decoder in
            let raw = try decoder.singleValueContainer().decode(String.self)
            if let date = try? Date(raw, strategy: .iso8601.year().month().day().time(includingFractionalSeconds: true)) {
                return date
            }
            if let date = try? Date(raw, strategy: .iso8601) { return date }
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Bad timestamp \(raw)"))
        }
        return d
    }()

    private struct ErrorBody: Decodable { let error: String }
    private struct Empty: Encodable {}

    func get<T: Decodable>(_ path: String, query: [String: String] = [:]) async throws -> T {
        try await send("GET", path, query: query, body: Optional<Empty>.none)
    }

    func send<T: Decodable, B: Encodable>(
        _ method: String, _ path: String, query: [String: String] = [:], body: B?
    ) async throws -> T {
        var components = URLComponents(url: Self.baseURL.appending(path: "api/v1" + path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty { components.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) } }
        var request = URLRequest(url: components.url!)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(body)
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch is CancellationError {
            throw CancellationError()
        } catch let error as URLError where error.code == .cancelled {
            throw CancellationError()
        } catch {
            throw APIError.offline
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            if status == 401, token != nil { onUnauthorized?() }
            // nginx answers rate limits with an HTML page, not JSON.
            let message = (try? decoder.decode(ErrorBody.self, from: data))?.error
                ?? (status == 429 ? "Too many requests — wait a minute and try again." : "Something went wrong (\(status)).")
            throw APIError(status: status, message: message)
        }
        return try decoder.decode(T.self, from: data)
    }

    // For calls whose answer is just {ok: true}.
    struct OK: Decodable {}

    func send<B: Encodable>(_ method: String, _ path: String, body: B?) async throws {
        let _: OK = try await send(method, path, body: body)
    }

    func send(_ method: String, _ path: String) async throws {
        let _: OK = try await send(method, path, body: Optional<Empty>.none)
    }
}
