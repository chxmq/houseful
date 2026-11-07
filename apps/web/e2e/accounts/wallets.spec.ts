/**
 * A fan's account keeps a list of wallets on /account. One is active, any can be chosen, and one that holds no live
 * ticket can be delinked. The page links an address the fan types, so the "second wallet" here is the address of an
 * injected wallet, and the first is the wallet built into this phone.
 */
import { buyTicket, choosePay, openShow, pickSeat } from "../chain/helpers";
import { hostPhone, listShow } from "../chain/host";
import { signInFan } from "../support/auth";
import { test, expect } from "../support/fixtures";
import { deviceWalletAddress } from "../support/page";
import { linkWallet, openPhoneWallet, walletRow } from "./account-page";

test.describe("wallets on the account page", () => {
  test("a fan links a second wallet and chooses it", async ({ page, world, wallet }) => {
    const second = await wallet();
    await signInFan(page, world);
    await expect(page.getByText("No wallets linked yet. Add the phone wallet or an external one below.")).toBeVisible();

    // The wallet built into this phone exists once a page that needs it has opened. It is the first one linked, so it is active.
    const phone = await openPhoneWallet(page);
    await page.goto("/account");
    await linkWallet(page, phone);
    await expect(walletRow(page, phone)).toContainText("external · active · Linked wallet");

    // The second wallet is listed but not active, and choosing it moves "active" over.
    await linkWallet(page, second.address);
    await expect(walletRow(page, second.address)).toContainText("external · Linked wallet");
    await expect(walletRow(page, second.address)).not.toContainText("active");
    await walletRow(page, second.address).getByRole("button", { name: "Use this" }).click();
    await expect(walletRow(page, second.address)).toContainText("external · active · Linked wallet");
    await expect(walletRow(page, phone)).not.toContainText("active");
    await expect(walletRow(page, phone).getByRole("button", { name: "Use this" })).toBeVisible();

    // The choice is kept on the account, not on the page.
    await page.reload();
    await expect(walletRow(page, second.address)).toContainText("active");
    await expect(walletRow(page, phone)).not.toContainText("active");
  });

  test("a fan buys with the wallet the account has chosen", async ({ page, world, wallet, device, chain }) => {
    test.setTimeout(150_000);
    const chosen = await wallet();
    const show = await listShow((await hostPhone(device)).page, chain, { capacity: 5 });

    await signInFan(page, world);
    await linkWallet(page, chosen.address);
    await expect(walletRow(page, chosen.address)).toContainText("active");

    await openShow(page, show.slug);
    await pickSeat(page);
    await choosePay(page, "usdt");
    await buyTicket(page);

    // The show sold its ticket, to some wallet. The account says it pays with the chosen one.
    expect((await chain.read.ledger(show.chainEventId)).proceeds).toBe(show.price);
    const heldByChosen = (await chain.read.ticketOf(show.chainEventId, chosen.address)) !== null;
    test.fail(
      !heldByChosen,
      "Every purchase is signed by the browser's built-in wallet (deviceSigner in ticket-panel.tsx), whichever wallet the account has chosen.",
    );
    expect(heldByChosen, "the ticket is held by the wallet the account chose").toBe(true);
  });

  test("a wallet that holds no ticket can be delinked", async ({ page, world, wallet }) => {
    const empty = await wallet();
    await signInFan(page, world);
    const phone = await openPhoneWallet(page);
    await page.goto("/account");
    await linkWallet(page, phone);
    await linkWallet(page, empty.address);

    await walletRow(page, empty.address).getByRole("button", { name: "Delink" }).click();
    await expect(walletRow(page, empty.address)).toHaveCount(0);
    await expect(walletRow(page, phone)).toContainText("active");

    // Delinking the active wallet that is left empties the list.
    await walletRow(page, phone).getByRole("button", { name: "Delink" }).click();
    await expect(page.getByText("No wallets linked yet.")).toBeVisible();
  });

  test("a wallet that holds a live ticket cannot be delinked, and the page says why", async ({ page, world, wallet, device, chain }) => {
    test.setTimeout(150_000);
    const empty = await wallet();
    const show = await listShow((await hostPhone(device)).page, chain, { capacity: 5 });

    // The fan buys, so the wallet built into this phone holds a live ticket. Both wallets are linked.
    await signInFan(page, world);
    await openShow(page, show.slug);
    await pickSeat(page);
    await choosePay(page, "usdt");
    await buyTicket(page);
    const holder = await deviceWalletAddress(page);
    await page.goto("/account");
    await linkWallet(page, holder);
    await linkWallet(page, empty.address);

    // The fan presses Delink on the holder. The app words the refusal, and the fan has to see those words.
    const reason = "That wallet still holds a live ticket. Resell at face value or wait until the show ends before delinking.";
    const answered = page.waitForResponse((res) => res.request().method() === "POST" && new URL(res.url()).pathname === "/account");
    await walletRow(page, holder).getByRole("button", { name: "Delink" }).click();
    await answered;
    const shown = await page.getByText(reason).waitFor({ timeout: 5_000 }).then(
      () => true,
      () => false,
    );

    // Whatever the page said, the delink was refused: the wallet is still linked and still holds the ticket.
    await page.goto("/account");
    await expect(walletRow(page, holder)).toBeVisible();
    await expect(walletRow(page, empty.address)).toBeVisible();
    expect(await chain.read.ticketOf(show.chainEventId, holder)).not.toBeNull();

    test.fail(
      !shown,
      "The refusal is thrown from a server action, and in a production build Next hides its text: the fan gets the page that says it could not load.",
    );
    expect(shown, `the refusal "${reason}"`).toBe(true);
  });
});
