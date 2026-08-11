import type { supabaseAdmin } from "@/lib/supabase/admin";
import { sendSponsorKitEmail } from "@/lib/email";

type Db = ReturnType<typeof supabaseAdmin>;

/** The bits of a box this needs. Deliberately not a whole `BoxRow`. */
export interface KitBox {
  id: string;
  slug: string;
  title: string;
  reward_kobo: number | string;
  sponsor_name: string | null;
  sponsor_prize_title: string | null;
  sponsor_email: string | null;
  /** The address we last posted a kit to, from 0055. */
  sponsor_kit_sent_to: string | null;
}

/**
 * Send the business their link and their artwork — **once**.
 *
 * Called from both places a sponsorship can be written: the create route, and
 * the PATCH that adds or edits one afterwards. Which means it is called on
 * every save of every sponsored box, including the saves that only nudged a
 * blurb — so the rule about when *not* to send is the whole of this function.
 *
 * It sends when the address is one we have not sent to. Not "when the box is
 * new", which would miss the common case of a deal signed after the safe went
 * up; and not "whenever there is an address", which would post another email
 * every time an admin re-uploaded a logo. Comparing against
 * `sponsor_kit_sent_to` rather than against a boolean is what makes correcting
 * a typo'd address do the right thing: the business at the corrected address
 * has still never been told.
 *
 * Fire-and-forget, like every other email here. A sponsor's inbox must never be
 * able to fail an admin's save — the box is already written by the time this
 * runs, and the worst outcome of a failure is that nobody was emailed, which is
 * exactly the state a retry of the same save will fix.
 */
export async function deliverSponsorKit(db: Db, box: KitBox): Promise<"sent" | "skipped"> {
  const email = box.sponsor_email?.trim().toLowerCase();
  if (!email || !box.sponsor_name) return "skipped";
  if (box.sponsor_kit_sent_to?.trim().toLowerCase() === email) return "skipped";

  try {
    await sendSponsorKitEmail({
      to: email,
      business: box.sponsor_name,
      title: box.title,
      slug: box.slug,
      rewardKobo: Number(box.reward_kobo),
      prizeTitle: box.sponsor_prize_title,
    });

    /*
     * Stamped after the send, not before.
     *
     * The failure this ordering picks is the recoverable one. Stamping first
     * means a send that throws is never retried and the business is never told;
     * stamping after means a send that succeeded but whose stamp failed to
     * write gets one duplicate email on the next save. A second copy of a
     * welcome mail is an annoyance. Silence is a refund conversation.
     */
    await db
      .from("boxes")
      .update({ sponsor_kit_sent_at: new Date().toISOString(), sponsor_kit_sent_to: email })
      .eq("id", box.id);

    return "sent";
  } catch (err) {
    console.error("[sponsor] kit delivery failed:", err);
    return "skipped";
  }
}

/**
 * The extra columns a caller has to select to be able to call this.
 *
 * Separate from `PUBLIC_BOX_COLUMNS` on purpose and permanently: `sponsor_email`
 * is a business's contact address, and that list is what every public read
 * carries into a browser. Anything appending these two to it has made a
 * mistake.
 */
export const SPONSOR_KIT_COLUMNS = "sponsor_email, sponsor_kit_sent_at, sponsor_kit_sent_to";
