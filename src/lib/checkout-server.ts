// Starting a payment, whichever way the player wants to make it.
//
// Three routes sell things — lives, power-ups, funding a box — and all three
// had the same six lines: initialise a Paystack transaction against the
// reference we just wrote onto the order, and hand the browser somewhere to go.
// Now that there are two ways to pay, those six lines have a branch in them,
// and a branch copied three times is a branch that will be fixed twice.
//
// The two methods are genuinely different Paystack products rather than a flag:
//
//   card      `/transaction/initialize`. Hands back an access code, which the
//             inline script resumes in Paystack's own iframe. We cannot draw
//             this form ourselves — see the note on PCI below.
//   transfer  `/charge`. Hands back a one-time account number, which is just
//             text, so the sheet a player reads it from is ours and looks like
//             the rest of the game.
//
// Both write the same reference, and that is what keeps the rest of the system
// from having to care which was used: `orderTableFor`, the webhook, the verify
// route and settlement all key off it. One order, one reference, one credit,
// however the money arrives — so a player who opens the card form, thinks
// better of it and transfers instead cannot end up with two of anything.
//
// **Why the card form is Paystack's and not ours.** A card form we drew would
// put the raw card number in our own DOM, which drags the whole application
// into PCI DSS SAQ D — annual audit, segmented network, penetration testing,
// the lot. Paystack has no tokenising field SDK to borrow instead (their inline
// iframe *is* the answer to that problem), so the honest choice is an iframe we
// don't own for cards, and everything else in our own hands.

import {
  chargeBankTransfer,
  initializeTransaction,
  type TransferDetails,
} from "@/lib/paystack";

/** How the player has said they want to pay. */
export type PayMethod = "card" | "transfer";

/** Anything else — a missing field, a typo, an old client — means card. */
export function payMethod(value: unknown): PayMethod {
  return value === "transfer" ? "transfer" : "card";
}

export type CheckoutBody =
  | {
      result: "redirect";
      authorizationUrl: string;
      accessCode: string;
      reference: string;
    }
  | { result: "transfer"; transfer: TransferDetails; reference: string };

/**
 * Begin one payment. Null means Paystack refused and the caller should fail the
 * order it has already written.
 */
export async function startCheckout(params: {
  email: string;
  amountKobo: number;
  reference: string;
  /** Where a card payment comes back to. Unused by a transfer. */
  callbackUrl: string;
  method: PayMethod;
}): Promise<CheckoutBody | null> {
  if (params.method === "transfer") {
    const transfer = await chargeBankTransfer({
      email: params.email,
      amountKobo: params.amountKobo,
      reference: params.reference,
    });
    if (!transfer) return null;
    return { result: "transfer", transfer, reference: params.reference };
  }

  const init = await initializeTransaction({
    email: params.email,
    amountKobo: params.amountKobo,
    reference: params.reference,
    callbackUrl: params.callbackUrl,
  });
  if (!init) return null;

  // Both routes to the same transaction: the access code for the inline form,
  // the URL as the fallback, and the reference so the browser can ask us to
  // verify it however it was paid.
  return {
    result: "redirect",
    authorizationUrl: init.authorizationUrl,
    accessCode: init.accessCode,
    reference: params.reference,
  };
}
