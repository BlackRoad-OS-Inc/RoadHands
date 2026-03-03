# Roadmap: PostHog Analytics Overhaul

## Overview

A complete rebuild of OpenHands analytics — moving from 11 scattered client-side events with missing context to a server-side-first architecture with a proper consent gate, dual OSS/SaaS modes, full identity management, business events across the conversation and credit lifecycle, and actionable PostHog dashboards. Four phases execute in strict dependency order: service foundation first, business events second, client cleanup third, activation and dashboards last.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Analytics service, identity, and PostHog session middleware (completed 2026-03-02)
- [x] **Phase 2: Business Events** - Conversation lifecycle and credit events captured server-side (completed 2026-03-02)
- [x] **Phase 3: Client Cleanup** - Remove old tracking code and clean up PostHog instance (completed 2026-03-03)
- [ ] **Phase 4: Activation and Dashboards** - Activation events and all PostHog dashboards built

## Phase Details

### Phase 1: Foundation
**Goal**: The AnalyticsService exists, consent is enforced at the service boundary, OSS and SaaS modes are correctly branched, and every authenticated request carries identity — making it safe and correct to add any event anywhere in the codebase
**Depends on**: Nothing (first phase)
**Requirements**: TRCK-01, TRCK-02, TRCK-03, TRCK-04, TRCK-05, TRCK-06, TRCK-07, IDNT-01, IDNT-02, IDNT-03
**Success Criteria** (what must be TRUE):
  1. A user who has not consented to analytics generates zero PostHog events when they log in or start a conversation
  2. A SaaS user login produces a PostHog person profile with email, org_id, plan_tier, and idp properties visible in PostHog
  3. An OSS user login produces no person profile and all events carry `$process_person_profile: False`
  4. Every event captured through AnalyticsService contains distinct_id, org_id, app_mode, and is_feature_env as base properties
  5. The app starts and stops cleanly — PostHog is initialized in FastAPI lifespan and `shutdown()` is called on exit to flush buffered events
**Plans**: TBD

### Phase 2: Business Events
**Goal**: The core product and revenue signals are flowing server-side — conversations are tracked from creation through terminal state, credit purchases and limit events are captured with full org context, and new user signups are recorded at the moment of creation
**Depends on**: Phase 1
**Requirements**: BIZZ-01, BIZZ-02, BIZZ-03, BIZZ-04, BIZZ-05, BIZZ-06
**Success Criteria** (what must be TRUE):
  1. Starting a conversation in the UI produces a `conversation created` event in PostHog with conversation_id, trigger, llm_model, agent_type, and org_id
  2. A conversation that reaches a terminal state produces a `conversation finished` event with turn_count, accumulated_cost_usd, prompt_tokens, completion_tokens, and terminal_state — or a `conversation errored` event with error_type
  3. A Stripe credit purchase produces a `credit purchased` event with amount_usd, org_id, credit_balance_before, and credit_balance_after
  4. An org hitting their credit limit produces a `credit limit reached` event with org_id and current credit_balance
  5. Creating a new account produces a `user signed up` event with idp and email_domain (no raw PII)
**Plans**: 3 plans
- [ ] 02-01-PLAN.md — User signup and credit purchased events (BIZZ-01, BIZZ-02)
- [ ] 02-02-PLAN.md — Conversation created event V1+V0 (BIZZ-04)
- [ ] 02-03-PLAN.md — Conversation terminal states and credit limit detection (BIZZ-05, BIZZ-06, BIZZ-03)

### Phase 3: Client Cleanup
**Goal**: The old client-side tracking layer is gone — no double-counting is possible, the PostHog instance contains only current event definitions, and the frontend forwards session IDs to the server so session replay connects to server-side events
**Depends on**: Phase 2
**Requirements**: CLEN-01, CLEN-02, CLEN-03, CLEN-04, INST-01, INST-02
**Success Criteria** (what must be TRUE):
  1. No `useTracking()` import exists anywhere in the frontend codebase and no React component calls `posthog.capture()` directly
  2. The `enterprise/experiments/` directory does not exist in the repository
  3. API requests from the browser include an `X-POSTHOG-SESSION-ID` header that matches the PostHog session visible in the browser's PostHog toolbar
  4. Old snake_case event definitions (e.g., `conversation_created`) are hidden in the PostHog UI and orphaned feature flags from the removed experiments are deleted
**Plans**: 3 plans
- [ ] 03-01-PLAN.md — Add tracing headers to PostHogProvider and remove useTracking hook + 11 call sites (CLEN-01, CLEN-03)
- [ ] 03-02-PLAN.md — Remove direct posthog.capture() calls and clean up test mocks (CLEN-01, CLEN-04)
- [ ] 03-03-PLAN.md — Verify CLEN-02, archive old events, delete orphaned feature flags (CLEN-02, INST-01, INST-02)

### Phase 4: Activation and Dashboards
**Goal**: Activation signals are tracked and all agreed dashboards are live in PostHog — stakeholders can answer conversion, retention, credit, churn, usage, and quality questions from PostHog without writing SQL
**Depends on**: Phase 3
**Requirements**: ACTV-01, ACTV-02, ACTV-03, INST-03, INST-04, INST-05, INST-06, INST-07, INST-08
**Success Criteria** (what must be TRUE):
  1. A user whose first conversation reaches FINISHED state produces a `user activated` event with time_to_activate_seconds and llm_model
  2. A user who connects a Git provider produces a `git provider connected` event with provider_type server-side
  3. The PostHog conversion funnel dashboard shows signup -> first conversation -> finished -> credit purchase as a four-step funnel
  4. The credit usage dashboard shows org-level credit purchased events, credit limit reached events, and credit balance trends grouped by org
  5. The product quality dashboard shows conversation success rate by terminal_state and error rates broken down by llm_model
**Plans**: 3 plans
- [ ] 04-01-PLAN.md — User activated and git provider connected events (ACTV-01, ACTV-02)
- [ ] 04-02-PLAN.md — Onboarding completed event with backend endpoint (ACTV-03)
- [ ] 04-03-PLAN.md — Six PostHog dashboards (INST-03, INST-04, INST-05, INST-06, INST-07, INST-08)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 4/4 | Complete   | 2026-03-02 |
| 2. Business Events | 3/3 | Complete   | 2026-03-02 |
| 3. Client Cleanup | 3/3 | Complete   | 2026-03-03 |
| 4. Activation and Dashboards | 0/3 | Not started | - |
