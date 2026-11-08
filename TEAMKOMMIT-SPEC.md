# TeamKommit --- Product & System Specification

**Document ID:** TK-SPEC-001\
**Version:** 1.0\
**Status:** Foundational product and engineering specification\
**Date:** 2 November 2026\
**Product category:** Hackathon team formation and lifecycle platform\
**Working name:** TeamKommit

> **Product thesis:** TeamKommit helps hackathon participants form teams
> that are not merely full, but compositionally suitable, operationally
> compatible and reliably constituted. It combines explainable teammate
> discovery with a rigorously controlled team-admission and lifecycle
> system.

------------------------------------------------------------------------

## 0. How to read this specification

This document defines the product vision, domain model, functional
capabilities, proposed innovations, algorithmic direction, system
invariants, technical architecture, validation strategy and delivery
boundaries.

It is deliberately **not yet the final CDC (cahier des charges)**. The
CDC will be derived from this validated specification and will translate
the product and engineering decisions into exhaustive requirements, user
stories, acceptance criteria, priorities and implementation tasks.

The specification distinguishes four kinds of statements:

-   **Product requirement:** a capability TeamKommit must provide.
-   **Business invariant:** a condition that must remain true regardless
    of user actions or failures.
-   **Proposed design:** a technically defensible direction, subject to
    implementation validation.
-   **Research question:** a decision that must be confirmed through
    experiments, not asserted as fact.

The word *innovation* is reserved for a mechanism that improves an
observable outcome. Transactions, indexes, idempotency, authorization,
WebSockets and automated tests are necessary engineering practices; they
are not presented as product innovations by themselves.

------------------------------------------------------------------------

# 1. Product identity and positioning

## 1.1 Name

**TeamKommit** combines the ideas of *team* and *commitment*, with a
subtle reference to a software commit: people deliberately joining a
shared undertaking.

The name is a working product identity. Trademark, domain and repository
availability must be checked independently before commercial use.

## 1.2 One-sentence definition

TeamKommit is a hackathon team-formation platform that helps
participants discover suitable teammates, assemble balanced teams,
manage membership decisions and maintain a trustworthy view of team
composition.

## 1.3 The problem

Hackathon team formation is often handled through scattered chat groups,
spreadsheets, social posts and informal direct messages. This creates
several recurring problems:

1.  Participants cannot easily discover who is still looking for a team.
2.  Team descriptions rarely explain which skills or roles are actually
    missing.
3.  Skill lists are difficult to compare: two people may list different
    terms for similar capabilities, while identical labels may hide very
    different experience.
4.  A team can attract many applicants without a clear way to prioritize
    or explain decisions.
5.  Team leaders must coordinate invitations and requests manually.
6.  Membership can become ambiguous when invitations, requests and
    direct joins happen concurrently.
7.  A team may appear to have a free place even though another
    participant has just taken it.
8.  Team composition changes are not always reflected consistently
    across the discovery board and participant interfaces.
9.  A participant may believe they joined because the interface
    displayed an optimistic success state, even though the server
    rejected the operation.
10. Participants who leave, change roles or become unavailable can
    destabilize the team after its initial formation.

These are not all the same problem. TeamKommit treats them as three
connected but distinct domains:

-   **Discovery:** finding relevant people and teams.
-   **Composition:** deciding what a suitable team should contain.
-   **Admission and lifecycle:** making membership changes valid and
    durable.

## 1.4 Product promise

TeamKommit should enable a participant to answer four questions:

-   Which teams or participants are relevant to me?
-   What does this team need, and what can I contribute?
-   What happens when I request or accept membership?
-   Is the membership state I see actually confirmed?

For a team leader, it should answer:

-   Which capabilities does the team already have?
-   Which capabilities are missing or underrepresented?
-   Which applicants best complement the current composition?
-   How many places remain, and which decisions are pending?
-   Can I trust that every accepted member is actually admitted?

## 1.5 Product boundaries

TeamKommit is **not** intended to become:

-   A general-purpose social network.
-   A project-management or issue-tracking platform.
-   A source-code hosting service.
-   A full chat, voice or video-conferencing product.
-   A recruitment marketplace.
-   A generic event-management suite.
-   An AI chatbot with team formation attached to it.

Communication can be integrated through notifications and links, but it
is not the core product. The core product is the discovery, composition
and lifecycle of hackathon teams.

------------------------------------------------------------------------

# 2. Product principles

All product and architectural decisions should follow these principles.

### P1 --- Team composition is the product

Every major feature must improve discovery, composition, admission or
team lifecycle. Features that do not support one of these domains are
out of scope unless a strong dependency is demonstrated.

### P2 --- Explain recommendations

A participant or leader must be able to understand why a person or team
is recommended. A single opaque compatibility percentage is
insufficient.

### P3 --- Separate suitability from eligibility

A candidate can be an excellent match but ineligible because they
already belong to another team, the team is full or the formation
deadline has passed. Ranking must never override eligibility.

### P4 --- The server decides membership

The browser may predict, optimistically render or notify. Only a
successful authoritative server operation can create membership.

### P5 --- One admission protocol

Invitation acceptance, join-request acceptance and code-based joining
must share the same admission rules and consistency boundary.

### P6 --- Preserve human agency

Recommendations support decisions; they do not silently assign
participants to teams. A leader or participant must explicitly consent
to membership.

### P7 --- Make constraints visible

Team capacity, required roles, time overlap, deadlines and eligibility
should be explicit rather than hidden in recommendation logic.

### P8 --- Prefer measurable mechanisms over fashionable infrastructure

A mechanism is justified by a measured product or reliability need, not
by the novelty of its technology.

------------------------------------------------------------------------

# 3. Users, roles and permissions

## 3.1 Participant

A registered hackathon participant who may be unassigned or belong to
one team.

Can: - Create and update their own profile. - Declare skills,
experience, preferred roles and availability. - Browse eligible teams. -
Discover other unassigned participants, subject to privacy settings. -
Publish or pause their "looking for a team" status. - Send, cancel and
respond to invitations addressed to them. - Submit and withdraw join
requests. - Leave their current team. - View their membership and team
history.

Cannot: - Accept a join request on behalf of a team leader. - Modify
another participant's profile. - Bypass team capacity or hackathon
eligibility. - Belong to multiple active teams in one hackathon.

## 3.2 Team leader

A participant holding the leader role for a team.

Can: - Create and configure a team. - Update the team's description and
composition goals. - Invite eligible participants. - Review and decide
join requests. - Remove members when the hackathon policy permits it. -
Close or reopen recruitment, subject to policy. - Transfer leadership. -
Disband the team when permitted.

The leader is not a separate account type. Leadership is a role within a
team and is scoped to a particular hackathon.

## 3.3 Team member

A participant with active membership who is not the leader.

Can: - View team information visible to members. - View membership and
recruitment status. - Leave the team. - Receive team notifications. -
Request leadership transfer where policy allows.

## 3.4 Hackathon organizer

The organizer configures the context in which teams are formed.

Can: - Create or manage a hackathon. - Configure team size
constraints. - Define formation windows and deadlines. - Define
eligibility requirements. - Publish the hackathon's skill/role taxonomy
or permit participant-defined skills. - View aggregate formation
statistics. - Apply explicitly documented administrative interventions.

Administrative interventions must be auditable. An organizer must not
silently rewrite membership history.

## 3.5 Platform administrator

A narrowly scoped operational role for abuse handling, account support
and platform configuration. It is not a substitute for hackathon-level
organizer permissions.

------------------------------------------------------------------------

# 4. Core domain model

The following entities define the conceptual model. Physical
collections/tables may differ after the implementation design is
validated.

## 4.1 Hackathon

Represents one event in which participants form teams.

Important attributes: - `id` - `name` - `slug` - `status` -
`registrationOpensAt` - `registrationClosesAt` -
`teamFormationOpensAt` - `teamFormationClosesAt` - `minTeamSize` -
`maxTeamSize` - `eligibilityPolicy` - `skillTaxonomyVersion` -
`timezonePolicy` - `createdAt` - `updatedAt`

A hackathon owns the scope of team uniqueness. A participant may
potentially join another team in a different hackathon, but not more
than one active team in the same hackathon.

## 4.2 Participant profile

Important attributes: - `participantId` - `displayName` - `biography` -
`skills[]` - `preferredRoles[]` - `experienceBySkill[]` -
`availability` - `timezone` - `lookingForTeam` - `visibility` -
`profileCompleteness` - `updatedAt`

A profile is not a verified résumé. Self-declared information must be
represented as self-declared. The system must not imply that skill
proficiency has been independently assessed.

## 4.3 Team

Important attributes: - `id` - `hackathonId` - `name` - `slug` -
`description` - `leaderParticipantId` - `minSize` - `maxSize` -
`memberCount` - `recruitmentStatus` - `lifecycleStatus` -
`compositionBlueprint` - `version` - `createdAt` - `updatedAt`

`memberCount` is a maintained aggregate used for fast capacity checks.
It must be reconciled against active membership records and protected by
transactional write rules.

## 4.4 Membership

Represents an active or historical relationship between one participant
and one team.

Important attributes: - `id` - `hackathonId` - `teamId` -
`participantId` - `role` (`LEADER` or `MEMBER`) - `status` -
`joinedAt` - `leftAt` - `version`

A participant's active membership is unique per hackathon. Historical
membership should be retained separately or represented with carefully
constrained history so that the active uniqueness rule remains
enforceable.

## 4.5 Invitation

Important attributes: - `id` - `hackathonId` - `teamId` -
`inviterParticipantId` - `inviteeParticipantId` (optional for shareable
invite links) - `tokenHash` - `status` - `expiresAt` - `consumedAt` -
`revokedAt` - `createdAt`

Raw invitation secrets must not be stored or logged. Store a secure hash
or equivalent verifier.

## 4.6 Join request

Important attributes: - `id` - `hackathonId` - `teamId` -
`participantId` - `message` - `status` - `createdAt` - `decidedAt` -
`decidedBy` - `decisionReason` (optional, bounded and safe)

## 4.7 Audit event

An immutable business record of a significant action.

Important attributes: - `id` - `hackathonId` - `teamId` -
`actorParticipantId` - `subjectParticipantId` - `eventType` -
`operationId` - `aggregateVersion` - `occurredAt` - `metadata`

Audit events describe what happened. They are not the sole source of
current membership state.

## 4.8 Outbox event

A durable event awaiting publication to real-time clients or downstream
projections.

Important attributes: - `id` - `aggregateType` - `aggregateId` -
`aggregateVersion` - `eventType` - `payload` - `createdAt` -
`publishedAt` - `attemptCount`

The outbox is written in the same database transaction as the business
change it represents.

------------------------------------------------------------------------

# 5. Team formation lifecycle

## 5.1 Participant lifecycle

A participant's formation state within a hackathon is conceptually one
of:

-   `NOT_REGISTERED`
-   `ELIGIBLE_UNASSIGNED`
-   `LOOKING_FOR_TEAM`
-   `HAS_PENDING_REQUESTS`
-   `HAS_PENDING_INVITATIONS`
-   `TEAM_MEMBER`
-   `FORMATION_CLOSED`

These are not necessarily mutually exclusive UI labels. For example, an
unassigned participant can simultaneously have pending invitations and a
join request. The implementation should model authoritative facts and
derive display states rather than persist a contradictory collection of
booleans.

## 5.2 Team lifecycle

A team has two related but distinct dimensions.

**Lifecycle status** - `ACTIVE` - `DISBANDED`

**Recruitment status** - `OPEN` - `PAUSED` - `CLOSED` - `FULL`

This separation avoids conflating a team that has intentionally stopped
recruiting with a team that no longer exists.

Derived rules: - `FULL` when active membership count equals maximum
capacity. - `OPEN` only when the leader permits recruitment and the team
has capacity. - `PAUSED` when recruitment is temporarily disabled by the
leader. - `CLOSED` when the leader has ended recruitment. - `DISBANDED`
when no active team remains under the applicable rules.

The database may cache a derived status for efficient queries, but every
admission must check authoritative conditions, not trust a potentially
stale board projection.

## 5.3 Formation completion

A team is not necessarily complete simply because it reaches its maximum
size. The product may show: - Capacity complete. - Required roles
covered. - Minimum skill coverage achieved. - Team still seeking a
particular capability.

These are different signals. TeamKommit must not label a team "balanced"
solely because it is full.

------------------------------------------------------------------------

# 6. Functional capabilities

## 6.1 Account and participant onboarding

### Purpose

Allow a participant to enter a hackathon context with enough structured
information for discovery and meaningful recommendations.

### Main flow

1.  Participant authenticates.
2.  Participant selects or opens a hackathon.
3.  Platform verifies registration and eligibility.
4.  Participant completes a profile.
5.  Participant declares skills and role preferences.
6.  Participant specifies availability and time zone.
7.  Participant chooses profile visibility.
8.  Participant may activate "looking for a team".

### Functional behavior

-   Profile completion must be incremental; a participant should not
    lose entered information when leaving the flow.
-   Skills should use a hackathon taxonomy where possible, while
    permitting a controlled "other skill" path.
-   Similar skill labels should be normalized for matching without
    erasing the participant's original wording.
-   A participant may distinguish a skill they can lead from one they
    can contribute to.
-   Availability should support recurring windows and explicit
    exceptions where practical.
-   The UI must show which profile fields are visible to other
    participants.
-   A participant can pause discovery without deleting their profile.

### Edge cases

-   A participant is invited while completing their profile.
-   A participant joins a team from another browser session.
-   A participant changes time zone while recommendations are cached.
-   A hackathon closes registration while the profile is being edited.
-   A participant deletes or hides optional profile fields.

## 6.2 Team creation

### Purpose

Allow an eligible unassigned participant to create a team with an
explicit formation objective.

### Creation inputs

-   Team name.
-   Short description.
-   Team size limits, constrained by hackathon policy.
-   Skills already represented.
-   Skills or roles sought.
-   Preferred collaboration hours.
-   Recruitment visibility.
-   Optional formation message.

### Behavior

-   The creator becomes the first member and initial leader in the same
    successful operation.
-   Team creation and initial membership must be atomic.
-   The team must not be publicly discoverable until the creation
    transaction commits.
-   A team cannot declare a maximum size outside the hackathon's
    permitted range.
-   The platform must prevent duplicate or confusing team identifiers
    within the same hackathon.
-   A team may be created as `PAUSED` or `OPEN`, according to the
    initial user choice.

### Edge cases

-   The participant creates two teams from two browser sessions.
-   The participant becomes a member of another team immediately before
    creation commits.
-   The hackathon formation window closes during creation.
-   The team name conflicts with an existing name or slug.
-   The database commits but the HTTP response is lost; retry must not
    create a second team.

## 6.3 Team discovery board

### Purpose

Make active, eligible recruitment opportunities discoverable.

### Listing content

-   Team name.
-   Short description.
-   Leader identity and permitted profile information.
-   Current member count and maximum capacity.
-   Skills already represented.
-   Skills sought.
-   Time-zone overlap summary.
-   Recruitment state.
-   Last meaningful composition update.
-   A clear action: view team, request to join or sign in.

### Filters and sorting

-   Skill or role sought.
-   Available places.
-   Team size.
-   Time-zone overlap.
-   Recruitment status.
-   Recently updated.
-   Composition gap relevance.

### Behavior

-   Only teams eligible to receive requests should appear in the default
    open-team view.
-   The board may use a denormalized read model for performance.
-   Board entries must expose a freshness timestamp or equivalent
    indication when data can lag.
-   A click on "request to join" must revalidate eligibility and
    capacity on the server.
-   A stale board result must never reserve a place.
-   Pagination must be stable enough to avoid excessive duplicates or
    omissions while the underlying board changes.

### Empty and exceptional states

-   No teams match filters.
-   A team becomes full while the participant is viewing it.
-   A team is paused or closed.
-   The hackathon formation deadline has passed.
-   A participant is already a member of a team.
-   A participant's profile is not visible to the public board.

## 6.4 Participant discovery

### Purpose

Allow an unassigned participant to discover other unassigned
participants who may complement their skills and preferences.

### Listing content

-   Display name and short introduction.
-   Declared skills and experience descriptors.
-   Preferred roles.
-   Time zone and availability summary.
-   Looking-for-team status.
-   Profile visibility.
-   Explanation of relevance to the current participant or team.

### Privacy

-   Do not expose email addresses, phone numbers or private contact
    details by default.
-   Participants must control whether they appear in public discovery.
-   Do not reveal precise availability if a broad overlap summary is
    sufficient.
-   Do not expose private matching inputs to unrelated participants.

## 6.5 Join requests

### Participant flow

1.  Participant opens a team.
2.  Platform explains the team's needs and current eligibility.
3.  Participant submits a request with an optional short message.
4.  Request becomes `PENDING`.
5.  Leader receives a notification.
6.  Leader accepts or declines.
7.  If accepted, the system executes the shared admission protocol.
8.  Participant and team receive the committed result.

### Leader flow

-   View pending requests.
-   Inspect the candidate profile and match explanation.
-   Accept or decline.
-   Optionally provide a bounded decision note.
-   See whether a request became invalid because the participant joined
    elsewhere, the team filled or recruitment closed.

### Rules

-   Only the team leader or an explicitly authorized organizer can
    decide.
-   A participant should not create multiple active requests to the same
    team.
-   A request is not a reservation of capacity.
-   Accepting a request does not bypass admission checks.
-   A declined request cannot be silently reactivated; a new request may
    be required according to policy.
-   The server must distinguish a rejected decision from a request that
    became ineligible before decision.

## 6.6 Invitations

### Invitation types

1.  **Direct invitation:** addressed to one known participant.
2.  **Shareable invitation:** a secret link or code that can be claimed
    by an eligible participant, if the hackathon permits it.

### Direct invitation behavior

-   Leader selects a participant.
-   Server verifies leader permission, participant eligibility and team
    recruitment state.
-   Invitation is created with an expiration.
-   Invitee receives a notification.
-   Invitee accepts or declines.
-   Acceptance enters the shared admission protocol.

### Shareable invitation behavior

-   Generate a cryptographically secure random token.
-   Store only a verifier/hash of the secret.
-   Apply expiration, revocation and usage constraints.
-   Rate-limit attempts and monitor suspicious failures.
-   Do not reveal whether a guessed code belongs to a particular team
    before appropriate verification.
-   A valid code grants the right to attempt admission, not a guaranteed
    seat.

### Expiration semantics

The system must define the authoritative time check at the admission
decision boundary. A token that expires while waiting in a queue must
not be accepted merely because the request began before expiry.

The precise policy is:

`valid_at_admission = token.status == PENDING AND authoritative_now < token.expiresAt`

The implementation must use a consistent server-side clock source and
test the boundary where `now == expiresAt`.

## 6.7 Membership management

### Member departure

When a member leaves: - Membership is ended. - Team member count is
decremented exactly once. - Recruitment state is recalculated. - Audit
event is recorded. - A team update event is placed in the outbox. -
Discovery projections are updated asynchronously.

### Leader departure

If the leader leaves and other members remain: - A valid successor must
be selected or explicitly chosen according to the configured policy. -
Leadership transfer and departure must occur atomically. - The former
leader must lose leader-only permissions at commit. - The new leader
must gain them at the same commit. - No intermediate state with two
leaders or no leader may become externally authoritative.

Proposed default successor policy: 1. Prefer a member who explicitly
accepted willingness to lead. 2. Otherwise prefer the earliest-joined
eligible member. 3. Use a deterministic participant identifier as final
tie-break.

The team may instead require the leader to nominate a successor before
leaving. This is a product policy decision to validate.

### Member removal

-   Only the leader or authorized organizer can remove a member.
-   A leader cannot remove themselves through the member-removal path;
    they must use the leader departure workflow.
-   Removal must have an auditable reason category.
-   Removed participants must receive a notification.
-   Rejoining may be blocked or allowed by hackathon policy.

### Last member departure

If the last member leaves: - Team becomes disbanded. - Recruitment
closes. - Pending invitations and requests become invalid. - Board
projections remove the team. - History remains available for audit and
support, subject to retention policy.

## 6.8 Team composition blueprint

### Purpose

Give leaders a structured way to describe the team they are trying to
form, instead of relying only on a free-text description.

### Blueprint content

-   Desired roles.
-   Required skills.
-   Preferred skills.
-   Minimum coverage levels.
-   Experience preferences.
-   Collaboration availability.
-   Optional team size target.

A blueprint should distinguish: - **Hard constraints:** mandatory
eligibility conditions. - **Soft goals:** preferences that improve the
composition score. - **Nice-to-have capabilities:** useful but not
essential.

The platform must show when a blueprint is too restrictive and produces
no feasible candidates.

## 6.9 Recommendations

Recommendations are described in detail in Section 7. They must remain
explainable, consent-based and subordinate to eligibility validation.

## 6.10 Notifications

Notification categories: - New invitation. - Invitation accepted or
declined. - New join request. - Join request accepted or declined. -
Membership confirmed. - Team became full. - Member joined or left. -
Leadership transferred. - Team recruitment paused or reopened. -
Formation deadline approaching.

Delivery channels for the first release: - In-app notifications. - Email
only if an email provider is configured and the user has consented.

Notifications are informational. They do not constitute the source of
truth for membership.

------------------------------------------------------------------------

# 7. Proposed innovations

This section defines product mechanisms that could differentiate
TeamKommit. Each proposal includes the problem, mechanism, expected
value, risk and validation method. These are hypotheses until measured.

## 7.1 Innovation A --- Team Composition Blueprint

**Problem:** A team listing usually says "looking for developers"
without specifying what the team actually lacks.

**Mechanism:** A leader defines a structured composition blueprint:
required roles, skills, collaboration windows and optional experience
targets. The platform compares current members with the blueprint and
identifies coverage gaps.

**Example:**

A team has: - Two backend contributors. - One designer. - No frontend
contributor. - Limited overlap on weekday evenings.

Its blueprint requests: - Frontend: required. - Product/design: already
covered. - Backend: optional. - Availability overlap: at least two
shared evenings per week.

The system can explain that a frontend candidate with compatible
availability contributes more marginal value than another backend
candidate with a similar profile.

**Expected value:** Better candidate discovery and more informative team
listings.

**Risk:** Leaders may over-specify requirements or create unrealistic
profiles.

**Validation:** Compare leader-rated relevance and request conversion
for blueprint-enabled listings against free-text-only listings.

## 7.2 Innovation B --- Marginal Contribution Matching

**Problem:** A candidate's standalone profile score does not measure how
much they improve a particular team.

**Mechanism:** Score a candidate according to their *marginal
contribution to the current team composition*, not only their individual
profile.

Let: - (T) be the current team. - (c) be a candidate. - (B) be the
team's composition blueprint. - (U(T,B)) be the composition utility of
team (T) against blueprint (B).

Define the candidate's marginal contribution:

\[ `\Delta`{=tex}(c `\mid `{=tex}T,B)=U(T`\cup`{=tex}{c},B)-U(T,B) \]

A candidate who fills a missing critical role may have a higher marginal
contribution than a candidate with more total skills but whose skills
duplicate those already represented.

This is a team-relative score. It is not a universal measure of a
person's worth.

**Expected value:** Recommendations adapt as the team changes.

**Risk:** A poorly designed utility function may reward narrow skill
checklists and undervalue interdisciplinary contributors.

**Validation:** Use curated team/candidate scenarios, compare rankings
with expert judgments and run controlled user evaluations.

## 7.3 Innovation C --- Formation Readiness Map

**Problem:** A team may be full but still lack a critical capability, or
have a strong composition but need one more member.

**Mechanism:** Present a compact readiness map with separate
dimensions: - Capacity progress. - Required role coverage. - Skill
coverage. - Availability overlap. - Recruitment state.

Do not collapse these dimensions into one misleading "team quality"
score.

**Expected value:** Leaders understand what remains to be done without
interpreting an opaque number.

**Risk:** Users may treat readiness as a guarantee of hackathon
performance.

**Validation:** Test whether users correctly understand team gaps and
make better recruitment decisions.

## 7.4 Innovation D --- Formation Path and Decision Explanation

**Problem:** Participants may not understand why a recommendation
appeared or why a request became invalid.

**Mechanism:** Every recommendation and admission outcome includes a
concise explanation based on actual rule evaluations.

Examples: - "Suggested because your frontend experience covers a skill
the team marked as required." - "Request could not be accepted because
the final place was committed to another participant." - "Invitation
expired before the admission operation committed."

The explanation must be generated from structured decision facts, not
fabricated after the event.

**Expected value:** More trust, fewer confusing outcomes and easier
support.

**Risk:** Explanations may reveal sensitive information or expose
internal abuse controls.

**Validation:** Measure user comprehension and support-request
reduction.

## 7.5 Innovation E --- Team Recovery Suggestions

**Problem:** A team can become compositionally weak after a member
leaves or changes availability.

**Mechanism:** Recompute the team's gap profile after significant
composition changes and suggest: - Which capability is now missing. -
Which blueprint requirements are no longer met. - Which unassigned
participants may cover the gap. - Whether the team should reopen
recruitment.

The system suggests; it never automatically recruits or changes
membership.

**Expected value:** Team formation remains useful after the initial join
event.

**Risk:** Excessive notifications or overreaction to temporary profile
changes.

**Validation:** Measure whether leaders act on useful recovery
suggestions and whether false alerts remain low.

## 7.6 Innovation F --- Admission Decision Trace

**Problem:** Under contention, users and developers need to know why one
admission succeeded and another failed.

**Mechanism:** Each admission command produces a structured internal
decision trace: - Eligibility evaluated. - Invitation/request validity
evaluated. - Team recruitment state evaluated. - Capacity condition
evaluated. - Participant active-membership condition evaluated. - Final
commit result. - Aggregate version and operation identifier.

The trace is not a verbose public debug dump. It is a controlled
operational record from which a safe user-facing explanation can be
produced.

**Expected value:** Better debugging, auditability and deterministic
incident analysis.

**Risk:** Logging sensitive information or creating expensive
synchronous audit work.

**Validation:** Replay recorded failure cases in tests and verify that
explanations match the committed outcome.

------------------------------------------------------------------------

# 8. Recommendation and matching model

## 8.1 Matching objectives

The recommendation system should optimize for useful team contribution,
not popularity.

It must consider: - Required role coverage. - Missing skill coverage. -
Skill complementarity. - Experience fit. - Availability overlap. -
Time-zone compatibility. - Participant preferences. - Team capacity and
eligibility.

The system must distinguish hard constraints from soft preferences.

## 8.2 Skill representation

A skill should not be represented only as a free-text label.

Proposed normalized representation:

-   `skillId`
-   `canonicalName`
-   `category`
-   `aliases[]`
-   `parentSkillId` (optional)
-   `taxonomyVersion`

Participant skill declaration:

-   `skillId`
-   `selfReportedLevel`
-   `confidenceOrEvidenceType`
-   `yearsOrExperienceBand` (optional)
-   `lastUsedAt` (optional)
-   `preferredContributionLevel`

Do not imply objective proficiency validation unless an actual
assessment exists.

## 8.3 Normalization

A candidate skill may map to: - An exact canonical skill. - A known
alias. - A parent category. - An unresolved custom skill.

Fuzzy matching may suggest mappings, but ambiguous mappings should be
reviewed or retained as custom values. A language model must not
silently rewrite a participant's skill profile.

## 8.4 Hard eligibility filter

Before ranking, filter candidates by hard conditions:

\[ E(c,T,H)= R(c,H) `\land`{=tex} A(c,H) `\land`{=tex} M(c,H)
`\land`{=tex} C(T,H) \]

Where: - (R): participant is registered/eligible for hackathon (H). -
(A): participant is available for team formation. - (M): participant has
no active membership in (H). - (C): target team is active, recruiting
and has potential capacity.

This is an initial discovery filter. Admission must revalidate every
condition at commit time.

## 8.5 Composition utility

A practical first model uses normalized dimensions.

Let: - (G_r(T,B)): required-role coverage. - (G_s(T,B)): required-skill
coverage. - (O(T)): availability overlap. - (P(c,T)): preference
compatibility. - (D(c,T)): diversity/complementarity contribution. -
(X(c,T)): experience fit.

One possible utility model:

\[ U(T,B)=w_rG_r+w_sG_s+w_oO+w_pP+w_dD+w_xX \]

with:

\[ w_i`\geq 0`{=tex},`\qquad `{=tex}`\sum`{=tex}\_i w_i=1 \]

The weights are configurable per hackathon or product experiment, but
defaults must be documented and versioned.

Candidate ranking uses:

\[
Score(c`\mid `{=tex}T,B)=100`\cdot`{=tex}`\Delta`{=tex}(c`\mid `{=tex}T,B)
\]

if utility is normalized to (\[0,1\]).

This score is a ranking aid, not a probability of success.

## 8.6 Coverage function

For a required skill (s), define a target coverage (q_s) and current
coverage (a_s(T)).

A simple bounded coverage function:

\[
g_s(T)=`\min`{=tex}`\left`{=tex}(1,`\frac{a_s(T)}{q_s}`{=tex}`\right`{=tex})
\]

where (a_s(T)) is a weighted sum of declared contributions from team
members.

The marginal coverage contribution of candidate (c) is:

\[ `\Delta`{=tex}\_s(c`\mid `{=tex}T)=g_s(T`\cup`{=tex}{c})-g_s(T) \]

This has a useful property: once the target coverage is met, adding more
of the same skill produces no additional coverage benefit.

For role coverage, use a similar function, while ensuring that a
participant is not assumed to fill mutually exclusive roles
simultaneously unless the profile explicitly allows it.

## 8.7 Availability overlap

Availability should be normalized into UTC intervals for computation
while preserving the participant's declared local time zone for display.

Let (A_i) be the set of available time intervals for participant (i)
within the relevant planning horizon.

A simple team overlap measure:

\[ O(T)=`\frac{\mu(\bigcap_{i\in T}A_i)}{\mu(W)}`{=tex} \]

where: - (`\mu`{=tex}) is interval duration. - (W) is the selected
planning window.

For a candidate:

\[ `\Delta`{=tex}\_O(c`\mid `{=tex}T)=O(T`\cup`{=tex}{c})-O(T) \]

This strict all-member intersection can be too harsh for larger teams. A
practical implementation may instead use pairwise overlap or a
quorum-based overlap measure. That choice must be explicit and tested;
it must not silently change the meaning of the score.

## 8.8 Score explanation

Each recommendation should expose a bounded explanation such as:

-   Required skill covered: frontend.
-   Role gap covered: frontend contributor.
-   Shared availability: 3 overlapping sessions in the selected horizon.
-   Duplicate skill contribution: low.
-   Preference compatibility: high.

Avoid statements such as "92% chance of winning" or "perfect teammate."
The system has no evidence to support those claims.

## 8.9 Algorithmic approach

Initial implementation: 1. Apply hard eligibility filters. 2. Retrieve a
bounded candidate pool using indexed attributes. 3. Compute
team-relative feature contributions. 4. Rank by marginal utility. 5.
Apply diversity constraints to avoid returning near-identical
candidates. 6. Return score components and explanation. 7. Recompute
when the team composition or blueprint changes.

For a moderate candidate pool, a deterministic scoring pass is
sufficient. Do not introduce a complex global optimizer before there is
evidence that ranking quality requires it.

For a future team-assembly mode involving several unassigned
participants, the problem can be modeled as constrained
grouping/assignment. That is a separate optimization problem and must be
evaluated against: - Team-size constraints. - Skill/role coverage. -
Participant preferences. - Availability. - Fairness across
participants. - Stability of proposed groups.

A greedy algorithm may be fast but can produce locally attractive,
globally poor groupings. If global assignment becomes necessary,
evaluate integer programming, min-cost flow or local-search methods
against a measured baseline. Do not claim global optimality from a
heuristic.

## 8.10 Fairness and bias controls

-   Do not rank by popularity, follower count or profile views.
-   Do not infer skill from demographic attributes.
-   Avoid penalizing incomplete profiles without showing the effect.
-   Provide a path for participants with non-standard skills.
-   Version the scoring model.
-   Log the model version used for a recommendation.
-   Evaluate whether certain declared roles or skill categories are
    systematically underexposed.
-   Allow a participant to opt out of public discovery.

------------------------------------------------------------------------

# 9. Admission protocol and consistency model

This is the most critical engineering subsystem because all team-joining
paths depend on it.

## 9.1 Admission command types

All admission paths become one internal command:

`AdmitParticipant(hackathonId, teamId, participantId, source, sourceId, idempotencyKey)`

Where `source` may be: - `INVITATION` - `JOIN_REQUEST` - `INVITE_CODE` -
`ORGANIZER_ACTION` (only if policy allows)

The source determines what must be validated, but not the core
membership invariants.

## 9.2 Admission preconditions

At the authoritative decision boundary: 1. Hackathon formation is open.
2. Participant is eligible. 3. Participant has no active membership in
the hackathon. 4. Team is active. 5. Team recruitment is open or the
source is explicitly allowed to bypass recruitment closure. 6. Team has
remaining capacity. 7. Invitation/request is valid and belongs to the
participant/team where applicable. 8. Actor has authority to trigger the
command. 9. Idempotency key is either new or resolves to the same prior
command.

## 9.3 Linearization point

The admission becomes effective at the successful database transaction
commit.

Before commit: - No client may treat the participant as a confirmed
member. - No public board projection should count the participant as
committed.

After commit: - Membership exists. - Capacity count reflects the
admission. - Source invitation/request is consumed or transitioned. -
Audit event exists. - Outbox event exists.

The client response may be lost after commit. The idempotency record
allows the same logical command to recover its result.

## 9.4 Required invariants

For each team (t):

\[ 0`\leq `{=tex}\|Members(t)\|`\leq `{=tex}MaxSize(t) \]

For each participant (u) and hackathon (h):

\[
`\sum`{=tex}\_{t`\in `{=tex}Teams(h)}`\mathbf{1}`{=tex}\[u`\in `{=tex}Members(t)\]`\leq 1`{=tex}
\]

For each active team:

\[ #Leader(t)=1 \]

For a disbanded team:

\[ \|ActiveMembers(t)\|=0 \]

For each successful admission operation (o):

\[ #ActiveMemberships(o.participant,h)=1 \]

A retry of the same logical operation must not increase that count.

## 9.5 Proposed MongoDB implementation direction

If MongoDB is selected, use a replica set or supported deployment that
provides multi-document transactions.

Potential collections: - `teams` - `memberships` - `invitations` -
`join_requests` - `idempotency_records` - `audit_events` -
`outbox_events`

Potential indexes: - Unique active membership by
`(hackathonId, participantId)` using a partial unique index for active
records, or a dedicated active-membership relation. - Unique idempotency
key scoped by actor and operation. - Invitation token verifier index. -
Join request lookup by `(teamId, status, createdAt)`. - Board query
indexes aligned with hackathon, recruitment status and sort fields.

Capacity admission can use a conditional team update inside a
transaction:

-   Match the team by ID, active status and recruitment state.
-   Require `memberCount < maxSize`.
-   Increment `memberCount` and team version.
-   Insert the active membership under the unique participant/hackathon
    constraint.
-   Consume the invitation or accept the request.
-   Insert audit and outbox records.
-   Commit.

The conditional update serializes competing writes against the same team
document. If two transactions contend, one may receive a write conflict
and must retry the full transaction under a bounded retry policy. The
unique active-membership constraint protects against the same
participant being admitted to different teams concurrently.

The implementation must verify the exact MongoDB transaction and retry
behavior for the deployed server/driver versions. It must not rely on an
in-memory lock or a Redis lock as the correctness boundary.

## 9.6 Why not a Redis lock?

A Redis lock may be useful for some coordination workloads, but it is
not the source of truth for team membership. Lock expiry, process
pauses, network partitions and fencing behavior create additional
correctness questions.

The durable database constraints and transactional admission protocol
must independently preserve the business invariants.

## 9.7 Idempotency semantics

An idempotency record should include: - Scope (actor, hackathon and
operation class). - Idempotency key. - Canonical request hash. -
Processing state. - Final outcome. - Resource identifiers. - Creation
and expiry metadata.

Rules: - Same key + same canonical request returns the same logical
outcome. - Same key + different request is rejected. - A retry after
commit recovers the committed result. - A request that failed before
commit may be retried according to policy. - Idempotency retention must
exceed the maximum supported client retry horizon.

## 9.8 Contention policy

The system guarantees valid capacity, not an unobservable notion of
perfect network FIFO.

When multiple candidates compete for the final place: - The database's
successful serialization/commit order determines the winner. - The API
returns a clear result to every loser. - The product may later add an
explicit queue or lottery policy if fairness requires it. - Do not claim
that arrival timestamps from different clients establish a globally fair
order.

If strict fairness becomes a product requirement, define the fairness
policy explicitly and test it separately from capacity correctness.

## 9.9 Failure cases

  -----------------------------------------------------------------------
  Failure point                       Required behavior
  ----------------------------------- -----------------------------------
  Before transaction begins           No membership change

  During transaction before commit    Transaction aborts; no partial
                                      business state

  Write conflict                      Bounded full-transaction retry

  Capacity condition fails            Admission rejected as full

  Unique membership constraint fails  Admission rejected as already
                                      assigned

  Commit succeeds, response lost      Retry recovers original result

  Outbox publication fails            Event remains pending and is
                                      retried

  WebSocket connection fails          Client reconnects and
                                      resynchronizes

  Board projection lags               Admission still validates against
                                      authoritative state
  -----------------------------------------------------------------------

------------------------------------------------------------------------

# 10. Team lifecycle state transitions

## 10.1 Leadership transfer

Leadership is a membership role, not a separate account.

Transfer operation: 1. Verify current leader. 2. Verify successor is an
active member of the same team. 3. Verify team version/precondition. 4.
Demote old leader. 5. Promote successor. 6. Increment team version. 7.
Record audit and outbox events. 8. Commit atomically.

The invariant is exactly one active leader for every active team with
members.

## 10.2 Leader departure

The leader departure command must combine: - Successor selection or
explicit successor validation. - Role transfer. - Old leader membership
termination. - Member count update. - Recruitment state recalculation. -
Audit and outbox writes.

A leader must not be allowed to leave through a generic member-leave
operation that skips succession logic.

## 10.3 Concurrent lifecycle operations

Potential collisions: - Two leaders' browser sessions attempt different
successors. - A selected successor leaves during transfer. - Last member
leaves while organizer disbands team. - Leader closes recruitment while
a join request is being accepted. - A member is removed while they
attempt to leave.

Use aggregate version checks and transactional preconditions. A stale
command must fail with a conflict result and provide a refreshed state;
it must not overwrite a newer team state.

## 10.4 Versioning

Every team aggregate mutation increments a monotonically increasing
version.

Commands may include `expectedTeamVersion`. If the current version
differs, the server may: - Reject with a conflict requiring refresh;
or - Re-evaluate the command if it is safe and explicitly designed for
revalidation.

Never blindly apply stale client state over authoritative state.

------------------------------------------------------------------------

# 11. Real-time architecture

## 11.1 Events

Representative event types: - `team.created` - `team.updated` -
`team.member_joined` - `team.member_left` - `team.member_removed` -
`team.leader_changed` - `team.recruitment_changed` - `team.disbanded` -
`join_request.created` - `join_request.decided` - `invitation.created` -
`invitation.decided`

Events should include: - Event ID. - Aggregate ID. - Aggregate
version. - Event type. - Occurred-at timestamp. - Minimal safe payload.

## 11.2 Transactional outbox

Business state and its outbox event are written in the same transaction.
A publisher reads pending events and delivers them to the real-time
layer.

This avoids the failure mode where a membership commits but the process
crashes before publishing the corresponding event.

Delivery may be at least once. Consumers must tolerate duplicates.

## 11.3 Ordering and client recovery

Within one team aggregate, clients should apply events only when their
version is newer than the version they currently hold.

If a client receives: - A duplicate event: ignore it. - An older event:
ignore it. - A version gap: fetch an authoritative snapshot. - An event
for a team it can no longer access: refresh authorization and state.

A WebSocket or SSE message is a notification of a committed change, not
proof by itself that the client has a complete state.

## 11.4 Technology choice

WebSockets are appropriate when bidirectional live interaction is
needed. SSE may be simpler if the client only needs server-to-client
updates and commands remain ordinary HTTP requests.

The selection should be based on actual interaction requirements,
operational complexity and deployment behavior---not on the assumption
that WebSockets are inherently more scalable.

------------------------------------------------------------------------

# 12. Search, discovery and read models

## 12.1 Read/write separation

The authoritative team and membership records are optimized for
correctness. The discovery board is optimized for queries and can use a
denormalized read model.

The board read model may be updated asynchronously from outbox events.

## 12.2 Consistency contract

The board is eventually consistent within a bounded operational target.
Admission is strongly validated against authoritative state.

This means: - A stale board can briefly show a team that has just
filled. - A stale board cannot grant membership. - The admission API
must return a precise conflict outcome. - The board projection must
converge after event processing resumes.

## 12.3 Search strategy

Initial implementation should prefer indexed database queries and
bounded filters.

A dedicated search engine should only be introduced when measured
requirements justify it, such as: - Complex text search. -
High-cardinality filtering. - Relevance ranking beyond the database's
capabilities. - Search volume that materially affects the primary
database.

Do not add a search cluster solely for architectural appearance.

------------------------------------------------------------------------

# 13. Security, privacy and abuse prevention

## 13.1 Authentication

Use a well-maintained authentication implementation. Password storage,
session management, token rotation and account recovery must follow
current security practice.

## 13.2 Authorization

Enforce authorization server-side for every operation. Hiding a button
in React is not authorization.

Examples: - Only the current leader may decide requests. - Only
authorized members may view private team information. - A participant
may edit only their own profile. - An organizer may intervene only
within their hackathon scope.

## 13.3 Invitation protection

-   Cryptographically secure random token generation.
-   Hash token at rest.
-   Expiration and revocation.
-   Rate limits by account, IP/risk signal and token lookup path.
-   Generic failure responses where detailed responses would aid
    enumeration.
-   Abuse monitoring and safe audit metadata.

## 13.4 Privacy

-   Collect only information required for team discovery and
    coordination.
-   Make profile visibility explicit.
-   Keep direct contact information private by default.
-   Provide account/profile deletion or anonymization behavior according
    to retention obligations.
-   Do not use sensitive personal attributes in matching.
-   Avoid storing precise location when time-zone compatibility is
    sufficient.

## 13.5 Abuse cases

Consider: - Invitation-code brute force. - Spam join requests. -
Harassment through repeated invitations. - Impersonation. - Unauthorized
leader actions. - Scraping participant profiles. - Manipulated skill
declarations. - Malicious or oversized profile content.

Provide block/report controls only where the product has a defined
moderation and response process; do not create a report button with no
operational handling behind it.

------------------------------------------------------------------------

# 14. User experience principles

## 14.1 Discovery first

The primary experience should quickly show a participant: - Their
current formation state. - Whether they are looking for a team. -
Relevant teams or participants. - The next meaningful action.

## 14.2 Clear admission states

Use distinct labels: - Request sent. - Waiting for leader. - Invitation
received. - Admission processing. - Membership confirmed. - Request
declined. - Team full. - Already assigned elsewhere. - Invitation
expired.

Do not use "Joined" until the server confirms admission.

## 14.3 Optimistic UI

Optimistic rendering may be used for low-risk interface feedback, such
as showing that a request was submitted.

It must not display a confirmed membership before the authoritative
result. If a speculative update is rendered, it must be visibly
provisional and rolled back on conflict.

## 14.4 Accessibility

-   Keyboard-accessible forms and dialogs.
-   Visible focus states.
-   Semantic labels.
-   Screen-reader announcements for important asynchronous outcomes.
-   Do not communicate status through color alone.
-   Respect reduced-motion preferences.
-   Provide clear error messages adjacent to the relevant controls.

## 14.5 Responsive behavior

Core discovery, team details, profile editing, invitations and request
decisions must remain usable on mobile-sized screens.

------------------------------------------------------------------------

# 15. Non-functional requirements and measurable targets

These are target requirements for validation, not claims that the system
already meets them.

## 15.1 Scale profile

Challenge reference workload: - 10,000 participants. - 2,000 teams. -
100 concurrent users for the board load test. - 50 simultaneous attempts
for one final team place.

The architecture should avoid assuming that all 10,000 users are active
simultaneously.

## 15.2 Performance

Target: - Discovery board p95 below 200 ms under the specified
100-concurrent-user test, measured at the API boundary. - Admission
latency reported separately under contention. - Recommendation latency
reported with candidate-pool size. - No unbounded synchronous work in
the admission transaction.

Every performance report must specify hardware, database topology,
dataset shape, request mix, warm/cold conditions and tool configuration.

## 15.3 Reliability

-   No over-capacity team after any successful operation.
-   No duplicate active membership for a participant within one
    hackathon.
-   No orphaned confirmed membership without corresponding team count
    update.
-   No missing durable outbox record for a committed business mutation.
-   Recoverable client state after disconnection.
-   Bounded retry behavior under write conflicts.

## 15.4 Observability

Metrics: - Admission attempts, successes and rejection reasons. -
Transaction retries and write conflicts. - Team capacity utilization. -
Pending outbox count and event publication lag. - Board latency and
error rate. - Recommendation latency. - Invitation failures and
rate-limit triggers.

Logs must carry operation and correlation IDs while avoiding secrets and
unnecessary personal data.

## 15.5 Maintainability

-   Explicit domain boundaries.
-   Typed API contracts.
-   Versioned recommendation model.
-   Database migrations/index management.
-   Reproducible development environment.
-   Automated tests in CI.
-   Architecture decision records for consequential trade-offs.

------------------------------------------------------------------------

# 16. Testing and verification strategy

## 16.1 Unit tests

Cover: - Skill normalization. - Composition utility. - Candidate
marginal contribution. - Invitation validity. - Team lifecycle
transition rules. - Permission decisions. - Status derivation.

## 16.2 API integration tests

At least 20 meaningful API tests, covering: - Authentication. - Team
creation. - Board filtering. - Join request creation. - Join request
decisions. - Invitation creation and use. - Expiration and revocation. -
Membership departure. - Leadership transfer. - Team disbandment. -
Authorization failures. - Idempotent retries. - Invalid and stale
commands.

## 16.3 Concurrency tests

### Test A --- Fifty contenders, one remaining place

Given a team with one remaining place, launch 50 independent admission
attempts.

Expected: - Exactly one successful admission. - 49 capacity conflicts or
other explicitly justified rejections. - Team member count increases by
exactly one. - No duplicate active membership. - Audit and outbox
correspond to the single committed admission.

### Test B --- One participant, two teams

Race admission of the same participant into two different teams in the
same hackathon.

Expected: - At most one active membership. - The losing transaction
leaves no capacity reservation or partial state.

### Test C --- Mixed admission sources

Race invitation acceptance and join-request acceptance for the same
participant/team or different teams.

Expected: - Shared invariants hold. - A source is consumed only when the
relevant admission commits. - A retry returns the original logical
outcome.

### Test D --- Leader departure during admission

Race leader departure/transfer against acceptance of a join request.

Expected: - No unauthorized decision. - No invalid leadership state. -
No partial membership mutation.

### Test E --- Expiration boundary

Test just before expiry, exactly at expiry and just after expiry.

Expected: - The documented strict boundary rule is enforced
consistently.

### Test F --- Commit followed by lost response

Force the server/client connection to fail after commit but before the
response is received.

Expected: - Retry with the same idempotency key recovers the committed
outcome. - No second membership is created.

## 16.4 Property-based testing

Generate sequences of valid and invalid domain commands: - Create
team. - Invite participant. - Request to join. - Accept/decline. -
Leave. - Remove. - Transfer leader. - Close recruitment. - Disband.

After every committed command, assert all invariants.

When a generated sequence fails: - Preserve the random seed. - Minimize
the command sequence if the test framework supports shrinking. - Store
the minimized trace as a regression test.

This is especially valuable because many lifecycle bugs emerge from
sequences that are difficult to anticipate manually.

## 16.5 Failure and recovery tests

-   Kill the application process during an admission attempt.
-   Restart with pending outbox events.
-   Disconnect a client after commit.
-   Deliver duplicate events.
-   Deliver events out of order.
-   Pause the board projection consumer and resume it.
-   Simulate database write conflicts.
-   Verify no business invariant depends on a WebSocket being connected.

## 16.6 Load tests

Seed: - 10,000 participants. - 2,000 teams. - Realistic skill
distributions. - Realistic membership and recruitment states. - Pending
invitations and requests.

Test: - Board browsing. - Filters and pagination. - Team details. -
Recommendation queries. - Admission under both normal and hot-team
contention.

Report: - Throughput. - p50, p95 and p99 latency. - Error rates. -
Database resource usage. - Contention/retry rate. - Dataset and
environment.

------------------------------------------------------------------------

# 17. Proposed architecture

## 17.1 Initial architecture: modular monolith

Start with a modular monolith unless measured deployment or scaling
constraints prove otherwise.

Suggested modules: - Identity and Access. - Hackathon. - Participant
Profile. - Team. - Membership and Admission. - Invitation. - Join
Request. - Composition and Recommendation. - Discovery Read Model. -
Notification and Real-time Delivery. - Audit and Outbox.

This provides explicit domain boundaries without introducing network
failure and operational overhead between modules.

## 17.2 Suggested technology direction

The challenge's preferred stack is: - React. - Node.js. - Express. -
MongoDB.

A defensible implementation can use: - TypeScript across frontend and
backend. - React for the participant and leader interface. -
Node.js/Express for the API. - MongoDB replica-set transactions for the
proposed admission design. - WebSockets or SSE for committed updates. -
Redis only if a measured need exists for ephemeral caching, rate
limiting or fan-out support. - Docker Compose for local development. -
CI for linting, type checking, tests and build verification.

Technology choices remain subject to a short architecture decision
record. The product specification does not mandate a technology merely
to create stack uniformity.

## 17.3 Logical flow

1.  React client submits a command over HTTP.
2.  API authenticates and authorizes the actor.
3.  Domain application service validates the command.
4.  Admission/lifecycle service executes a transaction.
5.  Transaction commits authoritative state, audit and outbox.
6.  Outbox publisher emits a committed event.
7.  Real-time gateway broadcasts permitted updates.
8.  Discovery projection updates.
9.  Clients reconcile events by aggregate version and fetch snapshots
    when needed.

## 17.4 Deployment shape

For the challenge: - One API service. - One background outbox/projection
worker (may initially share the same codebase). - MongoDB deployment
with transaction support. - Optional Redis only for justified supporting
workloads. - Frontend deployment. - Centralized logs and basic metrics.

Do not split these into microservices until independent scaling,
ownership or failure isolation has a demonstrated benefit.

------------------------------------------------------------------------

# 18. API capability map

This is a conceptual API map, not the final endpoint contract.

## Authentication and profile

-   Register/authenticate.
-   Read/update own profile.
-   Update discovery visibility.
-   Set looking-for-team status.
-   Manage availability and skills.

## Hackathon

-   List hackathons.
-   Read hackathon rules.
-   Read eligibility and formation window.

## Team

-   Create team.
-   Read team details.
-   Update team profile and blueprint.
-   Update recruitment state.
-   Disband team.

## Discovery

-   Search teams.
-   Search participants.
-   Filter by skill, role, capacity and availability.
-   Retrieve recommendation explanations.

## Join requests

-   Create request.
-   List own requests.
-   Cancel request.
-   List team requests (leader).
-   Accept/decline request (leader).

## Invitations

-   Create direct invitation.
-   Create shareable invitation where enabled.
-   List received invitations.
-   Accept/decline invitation.
-   Revoke invitation.
-   Validate/claim invite code.

## Membership

-   List team members.
-   Leave team.
-   Remove member.
-   Transfer leadership.
-   Read membership history.

## Real-time

-   Subscribe to authorized team events.
-   Subscribe to relevant discovery updates.
-   Recover from a version gap through snapshot retrieval.

All mutating commands should support appropriate idempotency and
concurrency preconditions.

------------------------------------------------------------------------

# 19. Data integrity and operational reconciliation

Even a transactional design benefits from reconciliation.

A scheduled integrity check should compare: - Team `memberCount` against
active membership count. - Active team leader against membership
roles. - Active membership against team lifecycle state. - Pending
invitations against team and participant eligibility. - Outbox backlog
against publication status.

Reconciliation must not silently repair ambiguous business state. It
should: 1. Detect the inconsistency. 2. Emit a structured alert. 3.
Apply only deterministic, documented repairs. 4. Preserve an audit
record. 5. Escalate ambiguous cases for operator review.

The normal admission path must prevent inconsistencies; reconciliation
is a safety net, not the primary consistency mechanism.

------------------------------------------------------------------------

# 20. Scope and release strategy

## 20.1 Challenge MVP

Must include: - Authentication and participant profiles. - Hackathon
context and rules. - Team creation and configuration. - Team discovery
board. - Participant discovery. - Join requests. - Direct invitations
and expiring invite codes. - Shared admission protocol. - Membership
lifecycle and leadership transfer. - Real-time updates. -
Audit/outbox. - Explainable first-version recommendations. - Responsive,
keyboard-accessible interface. - Automated tests, concurrency test, seed
data, load report and deployment.

## 20.2 Post-MVP

Potential extensions: - Multi-person team assembly suggestions. - Team
composition simulation ("what changes if this participant joins?"). -
More advanced constrained grouping/assignment. - Organizer analytics. -
Additional notification channels. - More sophisticated search. - Team
formation waitlists or explicit fairness policies. - Collaboration tools
through integrations.

These are not required to prove the core product.

## 20.3 Explicit non-goals for the challenge

-   Chat platform.
-   Video calls.
-   Project task management.
-   Code collaboration.
-   Payments.
-   Public social feed.
-   Automatic team assignment without consent.
-   Predictive claims about team success.
-   Kafka or microservices without a measured requirement.
-   AI-generated skill assessments.

------------------------------------------------------------------------

# 21. Open decisions requiring validation

The following are deliberate open questions, not omissions to be guessed
during implementation.

1.  Does every hackathon require teams to reach the minimum size before
    the formation deadline, or may smaller teams proceed with organizer
    approval?
2.  Can a participant leave and rejoin the same team?
3.  Can a removed participant join another team immediately?
4.  Is a shareable invitation code single-use, limited-use or
    unlimited-use until expiry?
5.  Can leaders close recruitment while pending requests remain?
6.  What is the exact leader succession policy?
7.  Are organizer-initiated membership changes permitted, and under what
    audit rules?
8.  Which availability model is most understandable to participants?
9.  Should the recommendation model optimize team-level coverage,
    participant preferences or a configurable balance?
10. Is strict fairness in the final-place race a product requirement, or
    is invariant-safe commit ordering sufficient for the challenge?
11. Which profile fields are visible to participants outside a team?
12. What is the retention policy for disbanded teams and historical
    membership?

These decisions must be resolved before finalizing the CDC.

------------------------------------------------------------------------

# 22. Definition of a successful TeamKommit

TeamKommit is successful when a participant can move from "I need a
team" to a clear, informed and confirmed team membership; when a leader
can build a team based on explicit composition needs; and when every
membership change remains valid under simultaneous actions, retries and
recoverable failures.

Its differentiation should come from the combination of:

1.  **Team-relative matching:** evaluate what a candidate adds to a
    particular team.
2.  **Structured composition blueprints:** make missing capabilities
    explicit.
3.  **Formation readiness:** expose separate, understandable dimensions
    of team completeness.
4.  **Explainable decisions:** show why recommendations and admission
    outcomes occur.
5.  **A single authoritative admission protocol:** ensure every joining
    path preserves the same invariants.
6.  **Recoverable real-time state:** keep the user interface aligned
    with committed team state.

The system should remain focused: help the right participants find one
another, form valid teams and keep those teams coherent as membership
changes.

------------------------------------------------------------------------

## Appendix A --- Mathematical and engineering cautions

1.  A weighted score is not automatically a calibrated probability.
2.  A greedy ranking algorithm is not a proof of globally optimal team
    composition.
3.  A high skill-coverage score does not guarantee team performance.
4.  A transaction does not remove the need for unique constraints and
    concurrency tests.
5.  A WebSocket event does not guarantee that a client has received
    every prior event.
6.  A timestamp from one client does not establish global arrival order.
7.  A cache or search projection must not authorize admission.
8.  A Redis lock must not be the only protection against over-capacity.
9.  A benchmark is meaningful only with reproducible workload and
    environment details.
10. "Exactly one winner" must be demonstrated by the concurrency test
    and database constraints, not asserted in documentation.

## Appendix B --- Proposed architecture decision records

Create separate ADRs before or during implementation for: - ADR-001:
Modular monolith and domain boundaries. - ADR-002: MongoDB transaction
and membership uniqueness strategy. - ADR-003: Team capacity admission
algorithm. - ADR-004: Idempotency key scope and retention. - ADR-005:
Invitation token and expiration semantics. - ADR-006: Team leader
succession policy. - ADR-007: Outbox publication and real-time
transport. - ADR-008: Recommendation utility function and weight
calibration. - ADR-009: Discovery read model and freshness contract. -
ADR-010: Observability and reconciliation.

**End of specification.**
