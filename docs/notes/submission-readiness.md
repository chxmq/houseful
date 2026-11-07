# Submission readiness, 7 November 2026

Checked against the user-supplied ETHGlobal Mumbai prize text and the team's submission draft. The planned targets are the building-from-scratch Best Use of IDKit prize and Build with Uniswap. This does not assert qualification for every sponsor listed on the prizes page, or guarantee judging eligibility.

## World: Best Use of IDKit

| Requirement | Evidence or remaining action |
| --- | --- |
| Functioning app using a supported credential | Human staging sign-in completed through the official simulator and official server verification service. The signed-in account then completed a local contract purchase and opened the ticket. See `local-demo-proof.md`. |
| Result verified securely on server | `src/server/world.ts` checks protocol, action, environment, signal, proof shape, verified nullifier and credential before the server issues attestations. Secrets stay server-side. |
| A specific trust moment and minimum sufficient assurance | Taking one fixed-price seat or waitlist place. `assuranceFor` requests human assurance for sold-out or higher-capacity/higher-price shows; other shows require selfie assurance. The server accepts an allowed stronger credential. World uniqueness guarantees and the trusted attester remain explicit assumptions. |
| Successful verification and meaningful alternative | Current staging sign-in and local purchases succeeded. Cancellation and unavailable-credential screens were observed; cancellation returned without signing in. PENDING(video): record both paths, including that the protected action does not occur on the unsuccessful path. |
| Integration debrief | `world-debrief.md` records time to first success, friction, missing capability/documentation and the highest-impact improvement. Follow-up local evidence is in `local-demo-proof.md`. |

IDKit and Agent Pass are distinct integrations and prizes. Houseful does not currently integrate the official Agent Pass. The fake-identity notice in the pasted Agent Pass track is not permission to accept unvalidated results in our IDKit backend. The supplied IDKit resources include the simulator; staging proof evidence must be labeled honestly rather than described as real-world uniqueness or production sign-off.

Continuity-only listings are not the planned target for this from-scratch submission.

## Uniswap: Build with Uniswap

| Requirement | Evidence or remaining action |
| --- | --- |
| Use an eligible part of the Uniswap stack | The contract's ETH route calls SwapRouter02 exact-output USDT conversion and refunds unused ETH. Local testing uses a mock; the separate Unichain proof uses real protocol contracts. Its recorded transaction receipt was independently rechecked as successful, addressed to the configured Houseful deployment and decoded as `buyWithEth`. |
| Public open-source repository | The repository was confirmed PUBLIC through repository metadata during this review. MIT license exists. |
| FEEDBACK.md | Present at repository root, with implementation feedback and recorded swap/liquidity transactions. |
| Completed developer feedback form with FEEDBACK.md link | PENDING(founder-confirmation): completion has not been established. Form: https://developers.uniswap.org/hackathon-feedback . Use the public file URL `https://github.com/chxmq/houseful/blob/main/FEEDBACK.md`. |
| README identifies relevant contracts and code lines | `buyWithEth` is at `packages/contracts/contracts/Houseful.sol:291`; `_swapEthForFaceValue` at line 749 in the reviewed source. README links to both. Recheck line references after contract changes. |
| Demonstrable integration | Preserve the ETH conversion path in the final demo. The uncommitted checkout rewrite currently selects USDT directly for all purchases; that path alone does not exercise Uniswap. |

## Other listed sponsors and final assets

The pasted page also lists 1inch, 0G, Arc, Hedera, Arkiv, Whitechain, Ethereum Foundation, ENS, Definitive and Chainlink. No integration or eligibility for those prizes is established by this review. A ticket contract or deployment on an EVM chain does not automatically meet another sponsor's requirements. There is no Agent Pass, Anon-RPC or alternative-mempool claim.

If Ethereum Foundation CROPS is selected later, its exact CROPS README section, property demonstration and privacy/dependency disclosures are additional requirements. Current World/backend dependence and public RPC reads must be stated; this is not currently a verified third sponsor entry.

PENDING(founder/submission): verify the selected prize categories in the actual form, feedback-form submission, final human-spoken video, screenshots/cover/logo, contribution statement, rule attestations and a reachable final hosted demo. The submission draft records a 09:00 IST close on 7 November; final submission is not proven by this checklist. Do not treat a draft or local server as a submitted entry.
