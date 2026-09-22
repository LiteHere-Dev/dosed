import { inviteCaregiver, acceptInvite, listMembers, removeMember, listSharedWithMe } from "./api";
import { resetSyncCursor } from "@/db/schema";
import { runSync } from "./sync";

export { inviteCaregiver, listMembers, removeMember, listSharedWithMe };

/**
 * Accepts a household invite and forces a full resync so the newly-shared
 * pet (and its medications/dose logs, which may be far older than this
 * device's sync cursor) shows up right away — see resetSyncCursor in
 * db/schema.ts and the comment in server/src/routes/household.ts.
 */
export async function acceptHouseholdInvite(token: string): Promise<{ petId: string }> {
  const { petId } = await acceptInvite(token);
  await resetSyncCursor();
  await runSync();
  return { petId };
}
