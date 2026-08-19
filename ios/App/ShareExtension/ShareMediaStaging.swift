import Foundation
import UniformTypeIdentifiers

private enum ShareInboxConstants {
    static let appGroupId = "group.app.reelish"
    static let inboxFolder = "ShareInbox"
    /// Matches `MAX_MEDIA_UPLOAD_BYTES` in `lib/media/local-store.ts`.
    static let maxFileBytes: Int64 = 80 * 1024 * 1024
}

/// Copies image/video/audio/data files from share item providers into the App Group inbox for host pickup.
enum ShareMediaStaging {

    private static let maxFiles = 8

    /// True when any attachment looks like image/video/audio we would try to stage (for handoff diagnostics).
    static func extensionItemsContainStagableMedia(_ items: [NSExtensionItem]) -> Bool {
        for item in items {
            for provider in item.attachments ?? [] {
                if preferredMediaUTI(provider) != nil { return true }
            }
        }
        return false
    }

    static func stageMedia(from items: [NSExtensionItem], completion: @escaping (String?) -> Void) {
        var work: [(NSItemProvider, String)] = []
        for item in items {
            for provider in item.attachments ?? [] {
                if let uti = preferredMediaUTI(provider) {
                    work.append((provider, uti))
                }
            }
        }
        guard !work.isEmpty else {
            completion(nil)
            return
        }
        let limited = Array(work.prefix(maxFiles))
        let session = UUID().uuidString
        guard let root = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: ShareInboxConstants.appGroupId) else {
            completion(nil)
            return
        }
        let dir = root.appendingPathComponent("\(ShareInboxConstants.inboxFolder)/\(session)", isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        } catch {
            completion(nil)
            return
        }

        let inner = DispatchGroup()
        var manifestRows: [[String: String]] = []
        let lock = NSLock()

        for (idx, pair) in limited.enumerated() {
            let provider = pair.0
            let uti = pair.1
            inner.enter()
            provider.loadFileRepresentation(forTypeIdentifier: uti) { url, _ in
                defer { inner.leave() }
                guard let srcUrl = url else { return }
                let accessing = srcUrl.startAccessingSecurityScopedResource()
                defer {
                    if accessing { srcUrl.stopAccessingSecurityScopedResource() }
                }
                if let rv = try? srcUrl.resourceValues(forKeys: [.fileSizeKey]),
                   let fs = rv.fileSize, Int64(fs) > ShareInboxConstants.maxFileBytes {
                    return
                }
                let ext = srcUrl.pathExtension.isEmpty ? fallbackExtension(for: uti) : srcUrl.pathExtension
                let name = "\(idx).\(ext)"
                let dest = dir.appendingPathComponent(name)
                do {
                    if FileManager.default.fileExists(atPath: dest.path) {
                        try FileManager.default.removeItem(at: dest)
                    }
                    try FileManager.default.copyItem(at: srcUrl, to: dest)
                    let mime = mimeType(for: uti, pathExtension: ext)
                    lock.lock()
                    manifestRows.append(["filename": name, "mimeType": mime])
                    lock.unlock()
                } catch {
                    // skip failed copy
                }
            }
        }

        inner.notify(queue: .main) {
            let sorted = manifestRows.sorted { ($0["filename"] ?? "") < ($1["filename"] ?? "") }
            let json: [String: Any] = ["version": 1, "files": sorted]
            guard let data = try? JSONSerialization.data(withJSONObject: json, options: []) else {
                try? FileManager.default.removeItem(at: dir)
                completion(nil)
                return
            }
            let manUrl = dir.appendingPathComponent("manifest.json")
            do {
                try data.write(to: manUrl)
                completion(session)
            } catch {
                try? FileManager.default.removeItem(at: dir)
                completion(nil)
            }
        }
    }

    /// Prefer specific UTIs in `registeredTypeIdentifiers` order — avoids grabbing `public.data` when a real image/video type exists.
    private static func preferredMediaUTI(_ provider: NSItemProvider) -> String? {
        let priority: [String] = [
            UTType.mpeg4Movie.identifier,
            "public.mpeg-4",
            UTType.movie.identifier,
            UTType.quickTimeMovie.identifier,
            "com.apple.quicktime-movie",
            UTType.image.identifier,
            "public.jpeg",
            "public.png",
            "public.heic",
            UTType.heic.identifier,
            UTType.jpeg.identifier,
            UTType.png.identifier,
            UTType.gif.identifier,
            UTType.webP.identifier,
            UTType.mp3.identifier,
            UTType.mpeg4Audio.identifier,
        ]
        let registered = provider.registeredTypeIdentifiers
        for want in priority where registered.contains(want) && provider.hasItemConformingToTypeIdentifier(want) {
            return want
        }
        for rid in registered {
            if rid == UTType.data.identifier { continue }
            let lower = rid.lowercased()
            if lower.hasPrefix("public.image") || lower.hasPrefix("public.movie") || lower.hasPrefix("public.video") {
                if provider.hasItemConformingToTypeIdentifier(rid) { return rid }
            }
        }
        if provider.hasItemConformingToTypeIdentifier(UTType.data.identifier) {
            return UTType.data.identifier
        }
        return nil
    }

    private static func fallbackExtension(for uti: String) -> String {
        if uti == UTType.movie.identifier || uti == UTType.mpeg4Movie.identifier || uti == UTType.quickTimeMovie.identifier {
            return "mov"
        }
        if uti == UTType.image.identifier || uti == UTType.jpeg.identifier { return "jpg" }
        if uti == UTType.png.identifier { return "png" }
        if uti == UTType.heic.identifier { return "heic" }
        if uti == UTType.mp3.identifier { return "mp3" }
        return "bin"
    }

    private static func mimeType(for uti: String, pathExtension ext: String) -> String {
        if let t = UTType(uti), let m = t.preferredMIMEType, !m.isEmpty {
            return m
        }
        let lower = ext.lowercased()
        switch lower {
        case "jpg", "jpeg": return "image/jpeg"
        case "png": return "image/png"
        case "heic": return "image/heic"
        case "gif": return "image/gif"
        case "webp": return "image/webp"
        case "mp4", "m4v": return "video/mp4"
        case "mov": return "video/quicktime"
        case "mp3": return "audio/mpeg"
        default:
            if uti.hasPrefix("public.image") || uti == UTType.image.identifier { return "image/jpeg" }
            if uti.hasPrefix("public.movie") || uti == UTType.movie.identifier { return "video/mp4" }
            return "application/octet-stream"
        }
    }
}
