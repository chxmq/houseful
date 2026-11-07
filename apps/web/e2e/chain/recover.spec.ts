/**
 * Phone-to-phone move used to be: export wallet key → import on new phone → rebind door key.
 * Key export is removed so tickets cannot be sold by handing over a private key.
 * Contract `recoverTicket` (World-proven move to a new wallet) is still PENDING a UI.
 */
import { test } from "../support/fixtures";

test.skip("moving a ticket to a new phone stops the old code and admits the new one", async () => {
  // Re-enable when /tickets exposes World ID recovery instead of raw key export.
});
