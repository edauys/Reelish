import Foundation

/// Reads staged files from the App Group `ShareInbox/<sessionId>/`, uploads each to the same
/// `/api/media/upload` endpoint as the web client, then removes the staging folder.
enum ShareInboxUploader {

    struct ManifestFile: Decodable {
        let filename: String
        let mimeType: String
    }

    struct Manifest: Decodable {
        let version: Int?
        let files: [ManifestFile]
    }

    struct InboxUploadResult {
        let mediaAssetIds: [String]
        let partialFailure: Bool
    }

    /// Matches `MAX_MEDIA_UPLOAD_BYTES` in `lib/media/local-store.ts`.
    private static let maxUploadBytes: Int64 = 80 * 1024 * 1024

    private static let recentLock = NSLock()
    private static var recentUploads: [String: (ids: [String], partial: Bool, at: Date)] = [:]
    private static let recentTTL: TimeInterval = 120

    private static var sessionQueues: [String: DispatchQueue] = [:]
    private static let queueMapLock = NSLock()

    private static func queueForSession(_ sessionId: String) -> DispatchQueue {
        queueMapLock.lock()
        defer { queueMapLock.unlock() }
        if let q = sessionQueues[sessionId] { return q }
        let q = DispatchQueue(label: "app.reelish.shareinbox.\(sessionId)")
        sessionQueues[sessionId] = q
        return q
    }

    static func resolveUploadBaseURL() -> URL? {
        if let u = loadCapacitorServerURL() { return u }
        if let s = Bundle.main.object(forInfoDictionaryKey: "ReelishUploadBaseURL") as? String,
           !s.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
           let u = URL(string: s) {
            return u
        }
        return nil
    }

    private static func loadCapacitorServerURL() -> URL? {
        guard let configUrl = Bundle.main.url(forResource: "capacitor.config", withExtension: "json"),
              let data = try? Data(contentsOf: configUrl),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let server = obj["server"] as? [String: Any],
              let urlStr = server["url"] as? String,
              let base = URL(string: urlStr) else {
            return nil
        }
        return base
    }

    private static func mediaUploadURL() -> URL? {
        guard let base = resolveUploadBaseURL() else { return nil }
        return base.appendingPathComponent("api").appendingPathComponent("media").appendingPathComponent("upload")
    }

    /// Uploads all files for a staging session; deletes the inbox folder when done (success or failure).
    static func uploadInbox(sessionId: String, sourceUrlFromQuery: String?, completion: @escaping (Result<InboxUploadResult, Error>) -> Void) {
        queueForSession(sessionId).async {
            uploadInboxSync(sessionId: sessionId, sourceUrlFromQuery: sourceUrlFromQuery, completion: completion)
        }
    }

    private static func cachedRecent(sessionId: String) -> InboxUploadResult? {
        recentLock.lock()
        defer { recentLock.unlock() }
        guard let entry = recentUploads[sessionId] else { return nil }
        if Date().timeIntervalSince(entry.at) > recentTTL {
            recentUploads.removeValue(forKey: sessionId)
            return nil
        }
        return InboxUploadResult(mediaAssetIds: entry.ids, partialFailure: entry.partial)
    }

    private static func rememberRecent(sessionId: String, ids: [String], partial: Bool) {
        recentLock.lock()
        recentUploads[sessionId] = (ids, partial, Date())
        if recentUploads.count > 24 {
            let cutoff = Date().addingTimeInterval(-recentTTL)
            recentUploads = recentUploads.filter { $0.value.at > cutoff }
        }
        recentLock.unlock()
    }

    private static func uploadInboxSync(sessionId: String, sourceUrlFromQuery: String?, completion: @escaping (Result<InboxUploadResult, Error>) -> Void) {
        if let cached = cachedRecent(sessionId: sessionId) {
            completion(.success(cached))
            return
        }

        guard let root = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: ReelishAppGroup.identifier) else {
            completion(.failure(NSError(domain: "ReelishShareInbox", code: 1, userInfo: [NSLocalizedDescriptionKey: "App Group container unavailable"])))
            return
        }
        let dir = root.appendingPathComponent("\(ReelishAppGroup.inboxFolder)/\(sessionId)", isDirectory: true)
        let manPath = dir.appendingPathComponent("manifest.json")

        func cleanupDir() {
            try? FileManager.default.removeItem(at: dir)
        }

        guard FileManager.default.fileExists(atPath: manPath.path) else {
            cleanupDir()
            if let cached = cachedRecent(sessionId: sessionId) {
                completion(.success(cached))
            } else {
                completion(.success(InboxUploadResult(mediaAssetIds: [], partialFailure: false)))
            }
            return
        }

        guard let mdata = try? Data(contentsOf: manPath),
              let manifest = try? JSONDecoder().decode(Manifest.self, from: mdata),
              !manifest.files.isEmpty else {
            cleanupDir()
            completion(.success(InboxUploadResult(mediaAssetIds: [], partialFailure: false)))
            return
        }
        guard let uploadURL = mediaUploadURL() else {
            cleanupDir()
            completion(.failure(NSError(domain: "ReelishShareInbox", code: 2, userInfo: [NSLocalizedDescriptionKey: "No server URL — set CAPACITOR_SERVER_URL (cap sync) or ReelishUploadBaseURL in Info.plist"])))
            return
        }

        var ids: [String] = []
        let lock = NSLock()
        var partial = false
        var firstHardError: Error?
        let group = DispatchGroup()

        for file in manifest.files {
            group.enter()
            let fileURL = dir.appendingPathComponent(file.filename)
            if let sz = fileByteSize(fileURL), sz > maxUploadBytes {
                lock.lock()
                partial = true
                lock.unlock()
                group.leave()
                continue
            }
            uploadFileWithRetries(sessionId: sessionId, fileURL: fileURL, mime: file.mimeType, uploadURL: uploadURL, sourceUrl: sourceUrlFromQuery) { result in
                switch result {
                case .success(let id):
                    lock.lock()
                    ids.append(id)
                    lock.unlock()
                case .failure(let e):
                    lock.lock()
                    partial = true
                    if firstHardError == nil { firstHardError = e }
                    lock.unlock()
                }
                group.leave()
            }
        }

        group.notify(queue: .global(qos: .userInitiated)) {
            cleanupDir()
            if ids.isEmpty {
                if let e = firstHardError {
                    completion(.failure(e))
                } else {
                    completion(.success(InboxUploadResult(mediaAssetIds: [], partialFailure: partial)))
                }
                return
            }
            rememberRecent(sessionId: sessionId, ids: ids, partial: partial)
            completion(.success(InboxUploadResult(mediaAssetIds: ids, partialFailure: partial)))
        }
    }

    private static func fileByteSize(_ url: URL) -> Int64? {
        guard let attrs = try? FileManager.default.attributesOfItem(atPath: url.path),
              let n = attrs[.size] as? NSNumber else { return nil }
        return n.int64Value
    }

    private static func uploadFileWithRetries(
        sessionId: String,
        fileURL: URL,
        mime: String,
        uploadURL: URL,
        sourceUrl: String?,
        completion: @escaping (Result<String, Error>) -> Void
    ) {
        let delays: [TimeInterval] = [0, 0.6, 1.6]

        func attempt(_ index: Int) {
            uploadFile(fileURL: fileURL, mime: mime, uploadURL: uploadURL, sourceUrl: sourceUrl) { result in
                switch result {
                case .success(let id):
                    completion(.success(id))
                case .failure(let error):
                    if index + 1 < delays.count, shouldRetryUpload(error: error) {
                        let d = delays[index + 1]
                        queueForSession(sessionId).asyncAfter(deadline: .now() + d) {
                            attempt(index + 1)
                        }
                    } else {
                        completion(.failure(error))
                    }
                }
            }
        }
        attempt(0)
    }

    /// Retry transient failures (network blips, rate limits, gateway errors).
    private static func shouldRetryUpload(error: Error) -> Bool {
        let ns = error as NSError
        if ns.domain == NSURLErrorDomain {
            switch ns.code {
            case NSURLErrorTimedOut, NSURLErrorCannotFindHost, NSURLErrorNetworkConnectionLost,
                 NSURLErrorNotConnectedToInternet, NSURLErrorDNSLookupFailed:
                return true
            default:
                break
            }
        }
        if ns.domain == "ReelishShareInbox" {
            let code = ns.code
            return code == 429 || code == 502 || code == 503 || code == 504
        }
        return false
    }

    /// Matches `@capacitor/preferences` (CapacitorStorage prefix) + optional plain key from tests.
    private static func loadAccessToken() -> String? {
        let keys = [
            "CapacitorStorage.reelish_supabase_access_token",
            "reelish_supabase_access_token",
        ]
        for k in keys {
            if let t = UserDefaults.standard.string(forKey: k)?.trimmingCharacters(in: .whitespacesAndNewlines), !t.isEmpty {
                return t
            }
        }
        return nil
    }

    private static func uploadFile(
        fileURL: URL,
        mime: String,
        uploadURL: URL,
        sourceUrl: String?,
        completion: @escaping (Result<String, Error>) -> Void
    ) {
        let boundary = "Boundary-\(UUID().uuidString)"
        var req = URLRequest(url: uploadURL)
        req.httpMethod = "POST"
        req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        if let token = loadAccessToken() {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        guard let body = try? buildMultipartBody(fileURL: fileURL, mime: mime, boundary: boundary, sourceUrl: sourceUrl) else {
            completion(.failure(NSError(domain: "ReelishShareInbox", code: 3, userInfo: [NSLocalizedDescriptionKey: "Could not build upload body"])))
            return
        }
        req.httpBody = body
        let task = URLSession.shared.dataTask(with: req) { data, response, err in
            if let err = err {
                completion(.failure(err))
                return
            }
            let http = response as? HTTPURLResponse
            if let code = http?.statusCode, code >= 400 {
                let msg = data.flatMap { String(data: $0, encoding: .utf8) } ?? "HTTP \(code)"
                let info: [String: Any] = [NSLocalizedDescriptionKey: msg]
                completion(.failure(NSError(domain: "ReelishShareInbox", code: code, userInfo: info)))
                return
            }
            guard let data = data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let id = json["mediaAssetId"] as? String else {
                completion(.failure(NSError(domain: "ReelishShareInbox", code: 4, userInfo: [NSLocalizedDescriptionKey: "Invalid upload response"])))
                return
            }
            completion(.success(id))
        }
        task.resume()
    }

    private static func buildMultipartBody(fileURL: URL, mime: String, boundary: String, sourceUrl: String?) throws -> Data {
        let fileData = try Data(contentsOf: fileURL)
        var d = Data()
        let crlf = "\r\n".data(using: .utf8)!
        d.append("--\(boundary)\r\n".data(using: .utf8)!)
        let filename = fileURL.lastPathComponent.replacingOccurrences(of: "\"", with: "_")
        d.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(filename)\"\r\n".data(using: .utf8)!)
        d.append("Content-Type: \(mime)\r\n\r\n".data(using: .utf8)!)
        d.append(fileData)
        d.append(crlf)
        if let s = sourceUrl, !s.isEmpty {
            d.append("--\(boundary)\r\n".data(using: .utf8)!)
            d.append("Content-Disposition: form-data; name=\"sourceUrl\"\r\n\r\n".data(using: .utf8)!)
            d.append(s.data(using: .utf8)!)
            d.append(crlf)
        }
        d.append("--\(boundary)--\r\n".data(using: .utf8)!)
        return d
    }
}
