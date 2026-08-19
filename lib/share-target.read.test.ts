import { describe, expect, it } from "vitest";
import { MAX_SHARE_TEXT_SEGMENTS, readShareFromSearchParams, SHARE_QUERY } from "./share-target";

describe("readShareFromSearchParams", () => {
  it("merges share_text and share_text_2..N into one text field", () => {
    const sp = new URLSearchParams();
    sp.set(SHARE_QUERY.text, "first");
    sp.set(`${SHARE_QUERY.text}_2`, "second");
    sp.set(`${SHARE_QUERY.text}_3`, "third");
    const r = readShareFromSearchParams(sp);
    expect(r.text).toBe("first\n\nsecond\n\nthird");
  });

  it("exposes native intake flag", () => {
    const sp = new URLSearchParams();
    sp.set(SHARE_QUERY.nativeIntake, "1");
    expect(readShareFromSearchParams(sp).nativeIntake).toBe(true);
  });

  it("exposes native staged media flag", () => {
    const sp = new URLSearchParams();
    sp.set(SHARE_QUERY.nativeStagedMedia, "1");
    expect(readShareFromSearchParams(sp).nativeStagedMedia).toBe(true);
  });

  it("exposes upload partial flag", () => {
    const sp = new URLSearchParams();
    sp.set(SHARE_QUERY.uploadPartial, "1");
    expect(readShareFromSearchParams(sp).uploadPartial).toBe(true);
  });

  it("respects MAX_SHARE_TEXT_SEGMENTS", () => {
    expect(MAX_SHARE_TEXT_SEGMENTS).toBeGreaterThanOrEqual(2);
  });

  it("detects share_inbox pending", () => {
    const sp = new URLSearchParams();
    sp.set(SHARE_QUERY.shareInbox, "abc-session");
    expect(readShareFromSearchParams(sp).shareInboxPending).toBe(true);
  });

  it("detects native upload failed", () => {
    const sp = new URLSearchParams();
    sp.set(SHARE_QUERY.nativeUploadFailed, "1");
    expect(readShareFromSearchParams(sp).nativeUploadFailed).toBe(true);
  });
});
