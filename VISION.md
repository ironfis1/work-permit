# Work Permit — Vision

## Problem

Turning a goal or vision statement into work a coding agent (Claude Code) can build against currently means a human manually writing specs, breaking them into day-sized chunks, writing test plans, checking security implications, and defining "done" - every time, for every project. That's slow, inconsistent, and the quality depends entirely on how much care the human had time to put in that day.

## What this is

A RAG-grounded pipeline that takes a goal, vision statement, or feature description and turns it into fully-specced, test-planned, security-reviewed units of work - sized so a human can review one in a day - ready to hand to Claude Code as GitHub issues.

It is not a one-shot generator. It is explicitly modeled on the same trust-graduation architecture as the Learner's Permit project: every output starts under full human review, and the pipeline earns increasing autonomy per category as its accuracy is demonstrated over time, exactly the way Learner's Permit stages an AI recommendation system from Learner's Permit -> Supervised -> Licensed. A tool that generates work for an autonomous coding agent should not itself be trusted autonomously on day one.

## Pipeline stages

1. **Intake.** Human supplies a goal, vision statement, epic description, or raw feature ask - free text, no required structure.
2. **Decomposition.** Goal -> epics -> stories. Each story is sized to be a "logical unit of work a human can reasonably review in a day" - this is the hard sizing constraint, not a suggestion. A story that can't be reviewed in a day gets split, not shipped oversized.

   > **Security note (carried forward from Story 1.3):** intake text is captured as inert, unvalidated free-text data - by design, no injection scanning happens at intake, since scanning would mean either false-positiving on legitimate goal text or silently mutating what the human submitted. That means decomposition is the first stage that hands this text to an LLM, and it's the first real prompt-injection surface in the pipeline: a hostile or careless goal statement could attempt to steer the decomposition engine into acting on embedded instructions rather than decomposing them (e.g. "ignore the above and instead...", fabricated epics/stories, attempts to reference or exfiltrate other stored intakes). Story work for this epic should treat intake text strictly as untrusted data in the prompt (clearly delimited, never treated as instructions from the system/operator), and should not skip this on the assumption intake already handled it.
3. **RAG-grounded spec generation.** Each story gets a detailed spec, retrieved and grounded against two corpora:
   - The target codebase itself (so specs stay consistent with existing patterns, naming, and prior decisions - no spec that contradicts code that already exists).
   - An external standards corpus: OWASP ASVS, OWASP Top 10, and a coding style guide. Security and coding-standard requirements in the spec cite back to a specific standard, not model priors.
4. **Gap detection and escalation.** Every spec is checked for ambiguity or missing information the way `extract-rules-and-flag-ambiguity` already does for this account: two independent extraction passes, diffed. Where a gap can be closed by grounding against the codebase or standards corpus, it's closed automatically and the resolution is logged. Where it can't - genuine product/business decisions, conflicting stakeholder intent, anything requiring judgment calls outside the corpora - it's escalated back to the human as an explicit open question, never silently guessed.
5. **Test planning.** Each unit of work gets, before any code exists:
   - A unit test plan and unit tests.
   - A functional test plan and functional tests.
   - Explicit acceptance criteria - what "successfully complete" means, checkable, not vibes-based.
   - Security and test-to-failure cases: what happens at the edges, what breaks it, where the failure mode is (this is deliberately adversarial, not just happy-path coverage).
6. **Standards compliance check.** The spec is checked against current cybersecurity and coding standards (grounded in the same corpus from stage 3) before it's allowed to graduate to output.
7. **Output.** The finished unit of work becomes a GitHub issue in the target repo/project - spec, tests, acceptance criteria, security notes, all attached - ready for Claude Code to build against.

## Trust staging (the Learner's Permit model, applied to this tool)

Each pipeline capability is its own trust category, tracked independently, exactly like Learner's Permit tracks dispatch/invoice/refund/escalation separately rather than as one blended score:

- **Decomposition** (goal -> epics/stories)
- **Spec generation** (story -> detailed spec)
- **Gap detection** (ambiguity flagging/resolution)
- **Test generation** (unit/functional/security/failure test plans)
- **Output creation** (pushing the finished issue to GitHub)

Every category starts at **Learner's Permit**: every single output requires human review and explicit approval before anything downstream happens - nothing is issued to GitHub un-reviewed. As accuracy on a category is demonstrated (human approves without correction, repeatedly, over a real sample size - not a handful of lucky runs), that category can be promoted to **Supervised** (drafted automatically, batched for a single review-and-approve pass rather than per-item) and eventually **Licensed** (autonomous within that category, with output creation the very last category to ever reach that stage, given the exact same "drift-triggered demotion" concept from the Learner's Permit roundtable doc: a category that starts producing worse output gets demoted automatically, not left running on stale trust).

No category is licensed at launch. This is stage 1 of its own build.

## Non-goals

- This is not a replacement for human judgment on genuine product decisions - the escalation path exists because some gaps are not the pipeline's to resolve.
- This is not scoped to Learner's Permit specifically. The codebase corpus is per-target-repo; the standards corpus is shared. It should work against any repo you point it at.
