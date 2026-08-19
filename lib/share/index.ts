/**
 * Share ingestion — public API for app code.
 */
export { buildShareIntakePayload, getOrCreateShareSessionId } from "@/lib/share/intake";
export { nativeHandoffToShareIntake } from "@/lib/share/native-handoff-contract";
export type { NativeShareHandoffInput } from "@/lib/share/native-handoff-contract";
export type { ShareIntakeOrigin, ShareIntakePayload } from "@/lib/share/types";
