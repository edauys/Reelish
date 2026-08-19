import UIKit
import UniformTypeIdentifiers
import os.log

/// iOS Share Extension → `reelish://handoff?…` using the same query keys as `lib/share-target.ts` (`SHARE_QUERY`).
/// Collects every legitimate text surface iOS exposes (item text/title, plain/UTF-8 text, URL, RTF, HTML)
/// without truncating. Very long bodies are split across `share_text`, `share_text_2`, … for reliable handoff.
final class ShareViewController: UIViewController {

    private static let shareExtensionLog = Logger(subsystem: "app.reelish", category: "ShareExtension")

    /// Per-query-param segment size (characters). Longer captions are continued in `share_text_2`, etc.
    private let maxCharsPerQuerySegment = 7500
    private let maxTextSegments = 32
    /// Very long `reelish://…` URLs cause `extensionContext.open` to return false (iOS URL / IPC limits).
    private static let maxSafeHandoffAbsoluteLength = 7200
    /// Must match `ReelishAppGroup` + `AppDelegate` (extension target does not compile that file).
    private static let appGroupIdentifier = "group.app.reelish"
    private static let pendingHandoffDefaultsKey = "reelish_pending_handoff_absolute_url"

    private lazy var statusLabel: UILabel = {
        let l = UILabel()
        l.textAlignment = .center
        l.numberOfLines = 0
        l.font = .preferredFont(forTextStyle: .body)
        l.textColor = .label
        l.translatesAutoresizingMaskIntoConstraints = false
        return l
    }()

    private final class OrderedCollector {
        private let lock = NSLock()
        private var counter = 0
        private var pairs: [(Int, String)] = []

        func allocateOrder() -> Int {
            lock.lock()
            defer { lock.unlock() }
            counter += 1
            return counter
        }

        func add(order: Int, _ value: String) {
            let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { return }
            lock.lock()
            defer { lock.unlock() }
            pairs.append((order, trimmed))
        }

        func sortedValues() -> [String] {
            lock.lock()
            defer { lock.unlock() }
            return pairs.sorted { $0.0 < $1.0 }.map { $0.1 }
        }
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        statusLabel.text = "Opening Reelish…"
        view.addSubview(statusLabel)
        NSLayoutConstraint.activate([
            statusLabel.leadingAnchor.constraint(equalTo: view.layoutMarginsGuide.leadingAnchor),
            statusLabel.trailingAnchor.constraint(equalTo: view.layoutMarginsGuide.trailingAnchor),
            statusLabel.centerYAnchor.constraint(equalTo: view.centerYAnchor),
        ])
        Self.shareExtensionLog.info("extension viewDidLoad — starting payload extraction")
        extractPayloadAndOpenHost()
    }

    private func extractPayloadAndOpenHost() {
        guard let items = extensionContext?.inputItems as? [NSExtensionItem], !items.isEmpty else {
            Self.shareExtensionLog.error("no input items — completing empty")
            statusLabel.text = "Nothing to share — try again from another app."
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { [weak self] in self?.finish() }
            return
        }

        Self.shareExtensionLog.info("inputItems count=\(items.count)")

        let group = DispatchGroup()
        var inboxSessionId: String?

        group.enter()
        ShareMediaStaging.stageMedia(from: items) { sessionId in
            inboxSessionId = sessionId
            if let s = sessionId {
                Self.shareExtensionLog.info("media staging session=\(s, privacy: .public)")
            } else {
                Self.shareExtensionLog.info("no media staged (text/link-only or no files)")
            }
            group.leave()
        }

        let collector = OrderedCollector()
        var titleCandidates: [String] = []
        var urlPairs: [(Int, String)] = []

        func recordUrl(order: Int, _ s: String) {
            let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !t.isEmpty else { return }
            urlPairs.append((order, t))
        }

        for item in items {
            if let c = item.attributedContentText?.string, !c.isEmpty {
                let o = collector.allocateOrder()
                collector.add(order: o, c)
            }
            if let t = item.attributedTitle?.string, !t.isEmpty {
                titleCandidates.append(t)
            }

            for provider in item.attachments ?? [] {
                logProviderTypes(provider)
                loadAllRepresentations(from: provider, group: group, collector: collector, recordUrl: recordUrl)
            }
        }

        group.notify(queue: .main) { [weak self] in
            guard let self else { return }

            let orderedTexts = collector.sortedValues()
            var body = self.prioritizeAndMergeShareText(orderedTexts)

            let urlsSorted = urlPairs.sorted { $0.0 < $1.0 }.map { $0.1 }
            let primaryUrl = urlsSorted.first { self.looksLikeHttpUrl($0) } ?? urlsSorted.first
            let extraUrls = urlsSorted.filter { $0 != primaryUrl }

            if !extraUrls.isEmpty {
                let block = "Additional links:\n" + extraUrls.joined(separator: "\n")
                body = body.isEmpty ? block : body + "\n\n⸻\n\n" + block
            }

            let primaryTitle = titleCandidates.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.first { !$0.isEmpty }
            let extraTitles = titleCandidates
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty && $0 != primaryTitle }
            if !extraTitles.isEmpty {
                let block = "Additional titles:\n" + extraTitles.joined(separator: "\n")
                body = body.isEmpty ? block : body + "\n\n⸻\n\n" + block
            }

            Self.shareExtensionLog.info("payload summary url=\(primaryUrl != nil) textChars=\(body.count) title=\(primaryTitle != nil) inbox=\(inboxSessionId != nil)")

            let hadStagableMedia = ShareMediaStaging.extensionItemsContainStagableMedia(items)

            self.openHost(
                url: primaryUrl,
                text: body,
                title: primaryTitle ?? "",
                receivedAt: ISO8601DateFormatter().string(from: Date()),
                inboxSessionId: inboxSessionId,
                hadStagableMedia: hadStagableMedia
            )
        }
    }

    private func logProviderTypes(_ provider: NSItemProvider) {
        let types = provider.registeredTypeIdentifiers
        Self.shareExtensionLog.debug("provider types count=\(types.count)")
    }

    /// Loads every text-like type the provider advertises (best-effort; duplicates removed when merging).
    private func loadAllRepresentations(
        from provider: NSItemProvider,
        group: DispatchGroup,
        collector: OrderedCollector,
        recordUrl: @escaping (Int, String) -> Void
    ) {
        // Prefer plain text before HTML/RTF so async completions still tend to preserve non-marketing lines when merged downstream.
        let typeChecks: [(String, () -> Void)] = [
            ("public.plain-text", {
                group.enter()
                let order = collector.allocateOrder()
                provider.loadItem(forTypeIdentifier: "public.plain-text", options: nil) { item, _ in
                    defer { group.leave() }
                    if let s = item as? String { collector.add(order: order, s) }
                }
            }),
            (UTType.url.identifier, {
                group.enter()
                let order = collector.allocateOrder()
                provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { [weak self] item, _ in
                    defer { group.leave() }
                    guard let self else { return }
                    if let u = item as? URL {
                        recordUrl(order, u.absoluteString)
                    } else if let s = item as? String, let u = URL(string: s) {
                        recordUrl(order, u.absoluteString)
                    }
                }
            }),
            ("public.url", {
                group.enter()
                let order = collector.allocateOrder()
                provider.loadItem(forTypeIdentifier: "public.url", options: nil) { [weak self] item, _ in
                    defer { group.leave() }
                    guard let self else { return }
                    if let u = item as? URL {
                        recordUrl(order, u.absoluteString)
                    } else if let s = item as? String, let u = URL(string: s) {
                        recordUrl(order, u.absoluteString)
                    }
                }
            }),
            (UTType.plainText.identifier, {
                group.enter()
                let order = collector.allocateOrder()
                provider.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) { item, _ in
                    defer { group.leave() }
                    if let s = item as? String { collector.add(order: order, s) }
                }
            }),
            ("public.text", {
                group.enter()
                let order = collector.allocateOrder()
                provider.loadItem(forTypeIdentifier: "public.text", options: nil) { item, _ in
                    defer { group.leave() }
                    if let s = item as? String { collector.add(order: order, s) }
                }
            }),
            ("public.utf8-plain-text", {
                group.enter()
                let order = collector.allocateOrder()
                provider.loadItem(forTypeIdentifier: "public.utf8-plain-text", options: nil) { item, _ in
                    defer { group.leave() }
                    if let s = item as? String { collector.add(order: order, s) }
                }
            }),
            (UTType.rtf.identifier, {
                group.enter()
                let order = collector.allocateOrder()
                provider.loadItem(forTypeIdentifier: UTType.rtf.identifier, options: nil) { item, _ in
                    defer { group.leave() }
                    if let data = item as? Data, let t = Self.rtfToPlainText(data) {
                        collector.add(order: order, t)
                    }
                }
            }),
            ("public.rtf", {
                group.enter()
                let order = collector.allocateOrder()
                provider.loadItem(forTypeIdentifier: "public.rtf", options: nil) { item, _ in
                    defer { group.leave() }
                    if let data = item as? Data, let t = Self.rtfToPlainText(data) {
                        collector.add(order: order, t)
                    }
                }
            }),
            (UTType.html.identifier, {
                group.enter()
                let order = collector.allocateOrder()
                provider.loadItem(forTypeIdentifier: UTType.html.identifier, options: nil) { item, _ in
                    defer { group.leave() }
                    if let data = item as? Data, let t = Self.htmlToPlainText(data) {
                        collector.add(order: order, t)
                    }
                }
            }),
            ("public.html", {
                group.enter()
                let order = collector.allocateOrder()
                provider.loadItem(forTypeIdentifier: "public.html", options: nil) { item, _ in
                    defer { group.leave() }
                    if let data = item as? Data, let t = Self.htmlToPlainText(data) {
                        collector.add(order: order, t)
                    }
                }
            }),
        ]

        for (uti, run) in typeChecks where provider.hasItemConformingToTypeIdentifier(uti) {
            run()
        }
    }

    private static func rtfToPlainText(_ data: Data) -> String? {
        guard let attr = try? NSAttributedString(
            data: data,
            options: [.documentType: NSAttributedString.DocumentType.rtf],
            documentAttributes: nil
        ) else { return nil }
        let s = attr.string.trimmingCharacters(in: .whitespacesAndNewlines)
        return s.isEmpty ? nil : s
    }

    private static func htmlToPlainText(_ data: Data) -> String? {
        guard let attr = try? NSAttributedString(
            data: data,
            options: [
                .documentType: NSAttributedString.DocumentType.html,
                .characterEncoding: String.Encoding.utf8.rawValue,
            ],
            documentAttributes: nil
        ) else { return nil }
        let s = attr.string.trimmingCharacters(in: .whitespacesAndNewlines)
        return s.isEmpty ? nil : s
    }

    private func looksLikeHttpUrl(_ s: String) -> Bool {
        let lower = s.lowercased()
        return lower.hasPrefix("http://") || lower.hasPrefix("https://")
    }

    /// Safari / Instagram often attach a short preview line plus richer plain/HTML elsewhere — never prefer the teaser when longer text exists.
    private func looksLikeInstagramOrSafariLinkTeaser(_ s: String) -> Bool {
        let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty, t.count <= 420 else { return false }
        let lower = t.lowercased()
        if lower.contains("see this instagram") && lower.contains("post") { return true }
        if lower.contains("see this instagram") && (lower.contains("reel") || lower.contains("video")) { return true }
        if t.count <= 240, lower.contains("instagram"), lower.contains("watch this") { return true }
        return false
    }

    /// Prefer substantive fragments (longer first), merge duplicates, then append teaser-only lines if they add new information.
    private func prioritizeAndMergeShareText(_ orderedParts: [String]) -> String {
        let fragments = orderedParts.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        guard !fragments.isEmpty else { return "" }
        if fragments.count == 1 { return fragments[0] }

        let teasers = fragments.filter { looksLikeInstagramOrSafariLinkTeaser($0) }
        let substantive = fragments.filter { !looksLikeInstagramOrSafariLinkTeaser($0) }
        let primaryPool = substantive.isEmpty ? fragments : substantive.sorted { $0.count > $1.count }

        var body = mergeDistinctPreserveOrder(primaryPool)

        if !substantive.isEmpty, !teasers.isEmpty {
            let teaserBlock = mergeDistinctPreserveOrder(teasers)
            if !teaserBlock.isEmpty {
                let contained =
                    body.range(of: teaserBlock, options: .caseInsensitive) != nil
                    || teaserBlock.count <= 8
                if !contained {
                    body = body + "\n\n⸻\n\nAdditional share line(s):\n" + teaserBlock
                }
            }
        }

        if body.isEmpty {
            body = mergeDistinctPreserveOrder(fragments)
        }
        return body
    }

    /// Keeps order; drops fragments that are fully contained in a longer fragment already merged (caption preservation).
    private func mergeDistinctPreserveOrder(_ parts: [String]) -> String {
        var acc = ""
        for p in parts {
            let t = p.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !t.isEmpty else { continue }
            if acc.isEmpty {
                acc = t
                continue
            }
            if acc.range(of: t, options: .caseInsensitive) != nil { continue }
            if t.range(of: acc, options: .caseInsensitive) != nil {
                acc = t
                continue
            }
            acc += "\n\n⸻\n\n" + t
        }
        return acc
    }

    private func openHost(
        url: String?,
        text: String,
        title: String,
        receivedAt: String,
        inboxSessionId: String?,
        hadStagableMedia: Bool
    ) {
        var textLimit = text.count
        var items = buildHandoffQueryItems(
            url: url,
            text: text,
            title: title,
            receivedAt: receivedAt,
            inboxSessionId: inboxSessionId,
            hadStagableMedia: hadStagableMedia,
            maxTextCharacters: nil,
            includeTruncatedFlag: false
        )

        var iterations = 0
        while absoluteHandoffLength(for: items) > Self.maxSafeHandoffAbsoluteLength && iterations < 24 {
            iterations += 1
            if textLimit > 256 {
                textLimit = max(256, textLimit / 2)
                Self.shareExtensionLog.warning("handoff URL too long — shrinking shared text to \(textLimit) chars (iter \(iterations))")
                items = buildHandoffQueryItems(
                    url: url,
                    text: text,
                    title: title,
                    receivedAt: receivedAt,
                    inboxSessionId: inboxSessionId,
                    hadStagableMedia: hadStagableMedia,
                    maxTextCharacters: textLimit,
                    includeTruncatedFlag: text.count > textLimit
                )
                continue
            }
            if let trimmed = trimItemsForHandoffLength(items) {
                Self.shareExtensionLog.warning("handoff still long — trimming share_url (iter \(iterations))")
                items = trimmed
                continue
            }
            break
        }

        if absoluteHandoffLength(for: items) > Self.maxSafeHandoffAbsoluteLength {
            Self.shareExtensionLog.error("handoff still too long after compaction — cannot open")
            statusLabel.text =
                "This share is too large for iOS to open Reelish in one step. Open Reelish from your Home Screen — the link field will still get the post URL when possible, or share again after trimming."
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.4) { [weak self] in self?.finish() }
            return
        }

        guard let handoff = handoffUrl(from: items) else {
            Self.shareExtensionLog.error("failed to build reelish://handoff URL")
            statusLabel.text = "Couldn’t build handoff URL."
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in self?.finish() }
            return
        }

        Self.shareExtensionLog.info(
            "handoff built — absolute len=\(handoff.absoluteString.count) scheme=\(handoff.scheme ?? "") host=\(handoff.host ?? "")"
        )
        storePendingHandoffForRelay(handoff.absoluteString)
        openHostUsingRelayStrategy(fullHandoff: handoff)
    }

    /// Full URL is persisted first; Simulator often fails `open()` on long custom-scheme URLs, so we open a tiny wake URL + restore in the host via `app_group_handoff=1`.
    private func storePendingHandoffForRelay(_ absoluteString: String) {
        guard let def = UserDefaults(suiteName: Self.appGroupIdentifier) else {
            Self.shareExtensionLog.error("App Group UserDefaults unavailable — check ShareExtension.entitlements")
            return
        }
        def.set(absoluteString, forKey: Self.pendingHandoffDefaultsKey)
        def.synchronize()
    }

    private func openHostUsingRelayStrategy(fullHandoff: URL) {
        guard let wake = URL(string: "reelish://handoff?app_group_handoff=1") else {
            Self.shareExtensionLog.error("failed to build wake URL")
            statusLabel.text = "Couldn’t build handoff."
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { [weak self] in self?.finish() }
            return
        }

        #if targetEnvironment(simulator)
        Self.shareExtensionLog.info("simulator: wake URL + App Group relay (stored full len=\(fullHandoff.absoluteString.count))")
        openWithLog(url: wake, tag: "simulator_wake") { [weak self] success in
            DispatchQueue.main.async {
                if success {
                    self?.finishAfterSuccessfulOpen()
                } else {
                    self?.finishAfterOpenFailed(isSimulatorPath: true)
                }
            }
        }
        #else
        Self.shareExtensionLog.info("device: try full handoff URL len=\(fullHandoff.absoluteString.count)")
        openWithLog(url: fullHandoff, tag: "device_full") { [weak self] success in
            guard let self else { return }
            if success {
                DispatchQueue.main.async { self.finishAfterSuccessfulOpen() }
            } else {
                #if REELISH_PERSONAL_TEAM_FALLBACK
                if UserDefaults(suiteName: Self.appGroupIdentifier) == nil {
                    Self.shareExtensionLog.warning(
                        "Personal Team build: no App Group — cannot restore handoff after failed open; user must open Reelish manually"
                    )
                    DispatchQueue.main.async { self.finishAfterOpenFailedPersonalTeamNoAppGroupRelay() }
                    return
                }
                #endif
                Self.shareExtensionLog.warning("device: full URL open=false — fallback wake URL + App Group")
                self.openWithLog(url: wake, tag: "device_wake_fallback") { success2 in
                    DispatchQueue.main.async {
                        if success2 {
                            self.finishAfterSuccessfulOpen()
                        } else {
                            self.finishAfterOpenFailed(isSimulatorPath: false)
                        }
                    }
                }
            }
        }
        #endif
    }

    private func openWithLog(url: URL, tag: String, completion: @escaping (Bool) -> Void) {
        Self.shareExtensionLog.info(
            "extensionContext.open [\(tag)] len=\(url.absoluteString.count) preview=\(String(url.absoluteString.prefix(120)), privacy: .public)"
        )
        guard let ctx = extensionContext else {
            Self.shareExtensionLog.error("extensionContext is nil — cannot open host")
            completion(false)
            return
        }
        ctx.open(url, completionHandler: { success in
            Self.shareExtensionLog.info("extensionContext.open [\(tag)] success=\(success)")
            completion(success)
        })
    }

    private func finishAfterSuccessfulOpen() {
        DispatchQueue.main.async { [weak self] in
            // `extensionContext.open(true)` does not guarantee the host app is foregrounded — common with Instagram.
            self?.statusLabel.text =
                "Handoff sent.\n\nIf Reelish didn’t come to the front, open it from your Home Screen — the import should be waiting. (iOS controls app switching; this isn’t a Reelish bug.)"
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.8) { [weak self] in
                self?.finish()
            }
        }
    }

    private func finishAfterOpenFailed(isSimulatorPath: Bool) {
        DispatchQueue.main.async { [weak self] in
            if isSimulatorPath {
                self?.statusLabel.text =
                    "Simulator: iOS often keeps you in the source app. Open Reelish from the home screen — with App Groups enabled, the full handoff is saved and replays when the app opens."
            } else {
                #if REELISH_PERSONAL_TEAM_FALLBACK
                self?.statusLabel.text =
                    "iOS didn’t switch to Reelish (common from Instagram). Open Reelish from your Home Screen — if the handoff URL was too long for this Personal Team build, the dashboard may only show the post link until you use a full App Groups build or share again."
                #else
                self?.statusLabel.text =
                    "iOS didn’t switch to Reelish automatically — that happens with some apps. Open Reelish from your Home Screen; the handoff is stored when possible and loads when the app opens."
                #endif
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.8) { [weak self] in
                self?.finish()
            }
        }
    }

    /// Personal Team build without App Groups: `extensionContext.open` failed and we cannot persist the full URL for the wake relay.
    private func finishAfterOpenFailedPersonalTeamNoAppGroupRelay() {
        statusLabel.text =
            "iOS couldn’t open Reelish with this handoff. Open Reelish from your Home Screen — you should still see the post link. Oversized shares need the App Groups build (paid developer setup) for automatic relay; Instagram often only sends a preview line anyway."
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) { [weak self] in
            self?.finish()
        }
    }

    private func handoffUrl(from items: [URLQueryItem]) -> URL? {
        var comp = URLComponents()
        comp.scheme = "reelish"
        comp.host = "handoff"
        comp.queryItems = items
        return comp.url
    }

    private func absoluteHandoffLength(for items: [URLQueryItem]) -> Int {
        handoffUrl(from: items)?.absoluteString.count ?? Int.max
    }

    private func buildHandoffQueryItems(
        url: String?,
        text: String,
        title: String,
        receivedAt: String,
        inboxSessionId: String?,
        hadStagableMedia: Bool,
        maxTextCharacters: Int?,
        includeTruncatedFlag: Bool
    ) -> [URLQueryItem] {
        let body: String
        if let m = maxTextCharacters {
            body = String(text.prefix(m))
        } else {
            body = text
        }

        var items: [URLQueryItem] = [
            URLQueryItem(name: "from_share", value: "1"),
            URLQueryItem(name: "intake_native", value: "1"),
            URLQueryItem(name: "share_received_at", value: receivedAt),
        ]
        if let u = url, !u.isEmpty {
            items.append(URLQueryItem(name: "share_url", value: u))
        }
        items.append(contentsOf: queryItemsForTextSegments(body))
        if !title.isEmpty {
            items.append(URLQueryItem(name: "share_title", value: title))
        }
        if let sid = inboxSessionId, !sid.isEmpty {
            items.append(URLQueryItem(name: "share_inbox", value: sid))
        }
        #if REELISH_PERSONAL_TEAM_FALLBACK
        if inboxSessionId == nil || inboxSessionId?.isEmpty == true,
           hadStagableMedia,
           FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: Self.appGroupIdentifier) == nil {
            items.append(URLQueryItem(name: "share_no_app_group", value: "1"))
        }
        #endif
        if includeTruncatedFlag {
            items.append(URLQueryItem(name: "share_handoff_truncated", value: "1"))
        }
        #if targetEnvironment(simulator)
        items.append(URLQueryItem(name: "share_handoff_simulator", value: "1"))
        #endif
        return items
    }

    /// When caption is already minimal but `share_url` is very long, shorten it so `extensionContext.open` can succeed.
    private func trimItemsForHandoffLength(_ items: [URLQueryItem]) -> [URLQueryItem]? {
        guard let idx = items.firstIndex(where: { $0.name == "share_url" }),
              let v = items[idx].value, v.count > 48 else { return nil }
        var next = items
        let cut = max(48, v.count / 2)
        next[idx] = URLQueryItem(name: "share_url", value: String(v.prefix(cut)))
        if !next.contains(where: { $0.name == "share_handoff_truncated" }) {
            next.append(URLQueryItem(name: "share_handoff_truncated", value: "1"))
        }
        return next
    }

    /// Splits `share_text` into `share_text`, `share_text_2`, … (see `readShareFromSearchParams`).
    private func queryItemsForTextSegments(_ full: String) -> [URLQueryItem] {
        guard !full.isEmpty else { return [] }
        var out: [URLQueryItem] = []
        var remaining = full[...]
        var index = 1
        while !remaining.isEmpty && index <= maxTextSegments {
            let chunk = remaining.prefix(maxCharsPerQuerySegment)
            let name = index == 1 ? "share_text" : "share_text_\(index)"
            out.append(URLQueryItem(name: name, value: String(chunk)))
            remaining.removeFirst(chunk.count)
            index += 1
        }
        return out
    }

    private func finish() {
        extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
    }
}
