import Foundation

/// App Group used by the Share Extension and host app for staging shared media before upload.
enum ReelishAppGroup {
    static let identifier = "group.app.reelish"
    static let inboxFolder = "ShareInbox"
    /// Full `reelish://handoff?…` string when using minimal wake URL (`app_group_handoff=1`) for simulator / fragile `open` paths.
    static let pendingHandoffAbsoluteURLKey = "reelish_pending_handoff_absolute_url"
}
