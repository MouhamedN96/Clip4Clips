---
name: mental-models-operator
description: The operator's decision toolkit — mental-model frameworks used as OPERATING tools for real ClipForge decisions (pricing, ban-proofing the farm, cutting dead channels, the posting/outreach loop, HITL gates, debugging). Use whenever you face a fleet decision and want the right framework, or want to capture a lived example to feed talking-head-content. Not a content idea bank — that's talking-head-content.
---

# Mental Models — Operator

This is how the operator *thinks* before acting on the fleet. Same frameworks the
`talking-head-content` idea bank turns into posts — but here they are **decision tools you
actually run**, not angles you write about. Reach for one when a real ClipForge decision
lands on you: what to price, what to cut, whether to approve, why something broke.

Golden rule: **run the framework on the real decision, then log the example** (see
"Proof-by-use" below). A framework you actually used on a live problem is both a better
decision AND authentic fuel for `talking-head-content` — a lived example clears the 2026
"substantial transformation" bar that a generic explainer never will.

## Framework → decision map (the backbone)

| Decision you're facing | Reach for | How you run it here |
|---|---|---|
| Set/re-set pricing or check margin | **First Principles** | Strip pricing to raw cost per client: fal/Qwen/Higgsfield/Hermes API spend + phone-farm amortization + human review minutes. Rebuild each rung's price from that floor, not from "what competitors charge." Know your true cost per posted clip before you quote a retainer. |
| "Could this kill the fleet?" | **Inversion** | Ask *how would we get every account banned?* — same caption spam, burst posting, missing AI labels, one IP behind the whole farm, no warm-up. Then design the daily loop to do the opposite. Ban-proofing is inverted planning. |
| Where to spend the 2 people + agents | **80/20 (Pareto)** | Find the ~20% of clients/channels driving ~80% of revenue and views. Feed them; cut or downgrade the long tail of dead channels burning farm capacity. Re-run monthly — the tail regrows. |
| The recurring cron post/react cycle | **OODA Loop** | Observe (trends via ScrapeCreators/Exa, what's landing), Orient (which persona angle + rung fits now), Decide (queue this clip/reel/spec-ad), Act (produce → stage → HITL). The whole daily loop IS an OODA cycle; tighten the loop time to out-maneuver bigger shops. |
| "What does this ToS move cost us later?" | **Second-Order Thinking** | First-order: this clip posts fine. Second-order: does the format saturate the content-reward pool, train detection on our fingerprint, or bank a ToS strike? Ask "what happens next?" before scaling any tactic that works. |
| An agent/clip/post failed | **5 Whys** | Bad output? Ask why five times — it's rarely the model, it's context/config upstream (wrong client brand, stale trend, missing key, mis-staged caption). Fix the root, not the symptom. |
| Automate-vs-do-it-myself triage | **Eisenhower** | Urgent+important → do now (a live ban, a client fire). Important, not urgent → automate/hand a subagent (the daily produce loop). Urgent, not important → delegate to the farm/cron. Neither → kill. This is the 2-person team's core triage. |
| Account durability / survival modeling | **Scenario Planning** | Model best/likely/worst account survival curves: aggressive posting = high reach, short life; conservative = slow, durable. Plan farm sizing and warm-up so worst-case (a platform purge) doesn't zero the business. |
| The approve/reject logic at a HITL gate | **Decision Trees** | Map the branches before the human sees the card: if AI-label missing → auto-reject-back; if caption reused → flag; if client-brand mismatch → reject; else → present clean yes/no. Pre-priced branches mean no surprises at `approve_clip`/`approve_outreach`. |
| Tightening the scoring/content loop | **Kaizen** | 1% better per day: one sharper scoring threshold, one tighter caption rule, one dead hook retired. Small compounding changes make a machine you can sell (rung 4). Don't rebuild the loop in a weekend — improve one link per cycle. |

## Extended bench (pull when the core ten don't fit)

- **SWOT** — audit our own stack before a competitor/platform does: where automation is
  strong, where it's one API outage or key revocation from dead.
- **Six Thinking Hats** — run one hard call (drop a client? change the offer?) through
  facts / gut / risk / upside / creative / process in one session instead of looping.
- **Socratic Method** — interrogate a plan's assumptions ("do we *know* this channel is
  dead, or did we just not post to it?") before acting on them.
- **Rapid Prototyping** — new format idea? Ship one ugly clip tonight, watch it fail, keep
  the one thing that worked. Don't spec a whole content line on a guess.
- **10/10/10** — before automating a task: does it help in 10 min / 10 months / 10 years?
  Some client-touch things you keep manual on purpose.
- **Lean** — audit the loop for waste: every copy-paste, every re-typed prompt, every
  manual handoff between produce and stage. Cut it, then cut again.

## Proof-by-use (capture every real application)

When you apply a framework to an actual decision, log a one-liner so it can become content:

> **`[date]` · `[framework]` · `[decision]` → `[what you did]` · `[result/number]`**
>
> e.g. *2026-07-18 · Inversion · asked what bans the farm → added 90-min jitter + per-account
> caption rewrite → 0 strikes across 40 accounts this week.*

Keep a rolling list of these. Hand them to `talking-head-content` as the "specific example"
its per-post structure requires — a real number and a named failure/win it can't fabricate.
This is the pipe from **operating** to **content**: decisions you actually made are the moat.

## "Hit decision X → reach for Y" quick lookup

- Pricing / unit economics → **First Principles**
- Fear of a ban wave → **Inversion** (+ **Scenario Planning** for sizing)
- Too much to do, 2 people → **Eisenhower** (+ **80/20** to pick what)
- Something broke → **5 Whys**
- A tactic is working, want to scale it → **Second-Order Thinking** first
- Standing at a HITL gate → **Decision Trees**
- The daily cron loop → **OODA**
- Making the machine steadily better / sellable → **Kaizen** (+ **Lean**)

## Cross-references

- **`clipforge-operator`** — the frameworks *inform* the loop that skill runs (the HITL
  gates, the produce→review→post cycle, the outreach loop). Decide with this, execute there.
- **`talking-head-content`** — its 19-angle idea bank is these same models as *content*;
  feed your proof-by-use log back to it so posts are lived, not theoretical.
