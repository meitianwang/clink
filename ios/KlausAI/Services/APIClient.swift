import Foundation

/// HTTP API client for Klaus backend.
/// Uses URLSession with shared cookie storage for automatic session management.
actor APIClient {
    let baseURL: URL
    private let session: URLSession
    private let decoder = JSONDecoder()

    init(baseURL: URL) {
        self.baseURL = baseURL
        let config = URLSessionConfiguration.default
        config.httpCookieAcceptPolicy = .always
        config.httpCookieStorage = .shared
        config.httpShouldSetCookies = true
        config.timeoutIntervalForRequest = 30
        self.session = URLSession(configuration: config)
    }

    // MARK: - Auth

    func register(
        email: String,
        password: String,
        displayName: String,
        inviteCode: String
    ) async throws -> User {
        var body: [String: String] = [
            "email": email,
            "password": password,
            "displayName": displayName,
        ]
        if !inviteCode.isEmpty {
            body["inviteCode"] = inviteCode
        }
        let response: AuthResponse = try await post("/api/auth/register", body: body)
        return response.user
    }

    func login(email: String, password: String) async throws -> User {
        let body = ["email": email, "password": password]
        let response: AuthResponse = try await post("/api/auth/login", body: body)
        return response.user
    }

    func logout() async throws {
        let _: [String: Bool] = try await post("/api/auth/logout", body: [:] as [String: String])
    }

    func fetchMe() async throws -> User {
        let response: AuthMeResponse = try await get("/api/auth/me")
        return response.user
    }

    // MARK: - Sessions

    func listSessions() async throws -> SessionsResponse {
        try await get("/api/sessions")
    }

    func deleteSession(sessionId: String) async throws {
        let encoded = sessionId.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? sessionId
        let _: [String: Bool] = try await delete("/api/sessions?sessionId=\(encoded)")
    }

    // MARK: - History

    func fetchHistory(sessionId: String, limit: Int = 200) async throws -> HistoryResponse {
        let encoded = sessionId.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? sessionId
        return try await get("/api/history?sessionId=\(encoded)&limit=\(limit)")
    }

    // MARK: - Upload

    struct UploadResponse: Codable, Sendable {
        let id: String
        let type: String
        let name: String
    }

    func uploadFile(data: Data, fileName: String, contentType: String) async throws -> UploadResponse {
        let encoded = fileName.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? fileName
        let url = baseURL.appendingPathComponent("/api/upload").appending(queryItems: [
            URLQueryItem(name: "name", value: encoded)
        ])
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        request.httpBody = data

        let (responseData, httpResponse) = try await session.data(for: request)
        try validateResponse(httpResponse, data: responseData)
        return try decoder.decode(UploadResponse.self, from: responseData)
    }

    // MARK: - File download

    func downloadFile(path: String) async throws -> (Data, String) {
        let url = baseURL.appendingPathComponent(path)
        let request = URLRequest(url: url)
        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw APIError.serverError("Download failed")
        }

        let contentType = httpResponse.value(forHTTPHeaderField: "Content-Type") ?? "application/octet-stream"
        return (data, contentType)
    }

    // MARK: - Private helpers

    private func get<T: Decodable>(_ path: String) async throws -> T {
        let url = baseURL.appendingPathComponent(path)
        let request = URLRequest(url: url)
        let (data, response) = try await session.data(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(T.self, from: data)
    }

    private func post<T: Decodable, B: Encodable>(_ path: String, body: B) async throws -> T {
        let url = baseURL.appendingPathComponent(path)
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await session.data(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(T.self, from: data)
    }

    private func delete<T: Decodable>(_ path: String) async throws -> T {
        let url = baseURL.appendingPathComponent(path)
        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"

        let (data, response) = try await session.data(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(T.self, from: data)
    }

    private func validateResponse(_ response: URLResponse, data: Data) throws {
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        switch httpResponse.statusCode {
        case 200...299:
            return
        case 401:
            throw APIError.unauthorized
        case 429:
            throw APIError.rateLimited
        default:
            if let errorResponse = try? decoder.decode(AuthErrorResponse.self, from: data) {
                throw APIError.serverError(errorResponse.error)
            }
            throw APIError.httpError(httpResponse.statusCode)
        }
    }
}

enum APIError: LocalizedError, Sendable {
    case invalidResponse
    case unauthorized
    case rateLimited
    case httpError(Int)
    case serverError(String)

    var errorDescription: String? {
        switch self {
        case .invalidResponse: return "服务器响应异常"
        case .unauthorized: return L10n.mapErrorCode("not_authenticated")
        case .rateLimited: return L10n.mapErrorCode("too_many_requests")
        case .httpError(let code): return "服务器错误 (\(code))"
        case .serverError(let msg): return L10n.mapErrorCode(msg)
        }
    }
}
