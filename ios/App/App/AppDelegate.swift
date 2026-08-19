import UIKit
import Capacitor
import os.log

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    private static let handoffLog = Logger(subsystem: "app.reelish", category: "ShareHandoff")

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        #if REELISH_PERSONAL_TEAM_FALLBACK
        Self.handoffLog.info(
            "REELISH_PERSONAL_TEAM_FALLBACK build: App Groups entitlement not used — ShareInbox staging + App Group handoff relay unavailable; URL/text share handoff still works."
        )
        #endif
        if let u = launchOptions?[UIApplication.LaunchOptionsKey.url] as? URL {
            Self.handoffLog.info("cold launch with launchOptions url=\(u.absoluteString, privacy: .public)")
        }
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
    }

    /// If the share extension could not `open()` the host app, the full handoff may still be in App Group — drain when user opens Reelish manually (common on Simulator).
    func applicationDidBecomeActive(_ application: UIApplication) {
        drainPendingHandoffFromAppGroupIfNeeded(app: application)
    }

    func applicationWillTerminate(_ application: UIApplication) {
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        Self.handoffLog.info(
            "application open url scheme=\(url.scheme ?? "", privacy: .public) host=\(url.host ?? "", privacy: .public) len=\(url.absoluteString.count)"
        )

        guard url.scheme == "reelish", url.host == "handoff" else {
            let forwarded = ApplicationDelegateProxy.shared.application(app, open: url, options: options)
            Self.handoffLog.info("non-handoff forwarded to Capacitor ok=\(forwarded)")
            return forwarded
        }

        return openReelishHandoff(app: app, incomingURL: url, options: options)
    }

    /// Share extension → `reelish://handoff?…`. Supports `app_group_handoff=1` wake URL that restores the full query from App Group (Simulator / short-URL workaround).
    private func openReelishHandoff(app: UIApplication, incomingURL: URL, options: [UIApplication.OpenURLOptionsKey: Any]) -> Bool {
        let viaAppGroup = URLComponents(url: incomingURL, resolvingAgainstBaseURL: false)?.queryItems?
            .first(where: { $0.name == "app_group_handoff" })?.value == "1"

        let effectiveURL: URL
        if viaAppGroup {
            guard let def = UserDefaults(suiteName: ReelishAppGroup.identifier),
                  let raw = def.string(forKey: ReelishAppGroup.pendingHandoffAbsoluteURLKey),
                  let full = URL(string: raw) else {
                Self.handoffLog.error("app_group_handoff=1 but pending URL missing or invalid in App Group")
                let forwarded = ApplicationDelegateProxy.shared.application(app, open: incomingURL, options: options)
                return forwarded
            }
            if var comp = URLComponents(url: full, resolvingAgainstBaseURL: false) {
                var q = comp.queryItems ?? []
                if !q.contains(where: { $0.name == "share_handoff_relay" }) {
                    q.append(URLQueryItem(name: "share_handoff_relay", value: "1"))
                }
                comp.queryItems = q
                effectiveURL = comp.url ?? full
            } else {
                effectiveURL = full
            }
            Self.handoffLog.info("restored full handoff from App Group len=\(raw.count) scheme=\(full.scheme ?? "") host=\(full.host ?? "")")
            def.removeObject(forKey: ReelishAppGroup.pendingHandoffAbsoluteURLKey)
            def.synchronize()
        } else {
            effectiveURL = incomingURL
            UserDefaults(suiteName: ReelishAppGroup.identifier)?.removeObject(forKey: ReelishAppGroup.pendingHandoffAbsoluteURLKey)
        }

        guard let items = URLComponents(url: effectiveURL, resolvingAgainstBaseURL: false)?.queryItems else {
            let forwarded = ApplicationDelegateProxy.shared.application(app, open: effectiveURL, options: options)
            Self.handoffLog.info("handoff no queryItems — forwarded ok=\(forwarded)")
            return forwarded
        }

        let inbox = items.first(where: { $0.name == "share_inbox" })?.value ?? ""
        guard !inbox.isEmpty else {
            let forwarded = ApplicationDelegateProxy.shared.application(app, open: effectiveURL, options: options)
            Self.handoffLog.info("handoff without share_inbox — forwarded to Capacitor ok=\(forwarded)")
            return forwarded
        }

        Self.handoffLog.info("handoff with share_inbox — immediate Capacitor forward + background upload inbox=\(inbox, privacy: .public)")
        let immediate = ApplicationDelegateProxy.shared.application(app, open: effectiveURL, options: options)
        Self.handoffLog.info("immediate Capacitor forward ok=\(immediate)")

        let sourceUrl = items.first(where: { $0.name == "share_url" })?.value
        ShareInboxUploader.uploadInbox(sessionId: inbox, sourceUrlFromQuery: sourceUrl) { result in
            DispatchQueue.main.async {
                var newItems = items.filter { $0.name != "share_inbox" }
                switch result {
                case .success(let uploadResult):
                    if !uploadResult.mediaAssetIds.isEmpty {
                        newItems.append(URLQueryItem(name: "share_media", value: uploadResult.mediaAssetIds.joined(separator: ",")))
                        newItems.append(URLQueryItem(name: "share_native_staged", value: "1"))
                    }
                    if uploadResult.partialFailure, !uploadResult.mediaAssetIds.isEmpty {
                        newItems.append(URLQueryItem(name: "share_upload_partial", value: "1"))
                    }
                    Self.handoffLog.info("upload finished ids=\(uploadResult.mediaAssetIds.count) partial=\(uploadResult.partialFailure)")
                case .failure(let err):
                    Self.handoffLog.error("upload failed: \(String(describing: err), privacy: .public)")
                    newItems.append(URLQueryItem(name: "share_native_upload_failed", value: "1"))
                }
                guard let baseComponents = URLComponents(url: effectiveURL, resolvingAgainstBaseURL: false) else {
                    Self.handoffLog.error("failed to rebuild handoff URL after upload (URLComponents nil)")
                    return
                }
                var rebuilt = baseComponents
                rebuilt.queryItems = newItems
                guard let newUrl = rebuilt.url else {
                    Self.handoffLog.error("failed to rebuild handoff URL after upload (url nil)")
                    return
                }
                let second = ApplicationDelegateProxy.shared.application(app, open: newUrl, options: options)
                Self.handoffLog.info("second Capacitor forward after upload ok=\(second)")
            }
        }
        return true
    }

    private func drainPendingHandoffFromAppGroupIfNeeded(app: UIApplication) {
        guard let def = UserDefaults(suiteName: ReelishAppGroup.identifier),
              let raw = def.string(forKey: ReelishAppGroup.pendingHandoffAbsoluteURLKey),
              !raw.isEmpty,
              let u = URL(string: raw),
              u.scheme == "reelish", u.host == "handoff" else { return }

        Self.handoffLog.info("didBecomeActive: replaying pending handoff from App Group len=\(raw.count) (extension open may have failed; clearing happens in open handler)")
        var replayUrl = u
        if var comp = URLComponents(url: u, resolvingAgainstBaseURL: false) {
            var q = comp.queryItems ?? []
            if !q.contains(where: { $0.name == "share_handoff_manual_resume" }) {
                q.append(URLQueryItem(name: "share_handoff_manual_resume", value: "1"))
            }
            comp.queryItems = q
            if let merged = comp.url { replayUrl = merged }
        }
        _ = openReelishHandoff(app: app, incomingURL: replayUrl, options: [:])
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
