# TeamKommit --- Architecture & Product Review

**Document ID:** TK-REVIEW-001\
**Review target:** `TEAMKOMMIT-SPEC.md`, version 1.0\
**Review date:** 2 November 2026\
**Review type:** Senior product architecture, domain modelling,
algorithm and reliability review\
**Decision:** **REVISE BEFORE IMPLEMENTATION**

------------------------------------------------------------------------

## 1. Executive verdict

The specification has a strong product boundary and correctly identifies
three connected concerns:

1.  Discovery of teams and participants.
2.  Composition of teams with complementary capabilities.
3.  Correct admission and team lifecycle management.

It also makes several sound engineering choices: one authoritative
admission path, explicit business invariants, a transactional outbox,
explainable recommendations, a modular monolith as the starting point,
and tests that exercise concurrent operations rather than only happy
paths.

However, version 1.0 is **not yet implementation-ready**. Some important
concepts are underspecified or internally inconsistent. The most
consequential issues concern:

-   Team state modelling.
-   Leadership succession and consent.
-   The mathematical meaning of the recommendation score.
-   Capacity enforcement and denormalized counters.
-   Idempotency under concurrent retries and rejected outcomes.
-   Minimum team size and hackathon closure.
-   Event ordering and read-model freshness.

The right response is not to add more infrastructure. It is to make the
domain model and decision semantics precise.

### Review summary

  --------------------------------------------------------------------------
  Area                  Verdict                                     Priority
  --------------------- ----------------------- ----------------------------
  Product boundary      Good                                             ---

  Team state model      Needs correction                                  P0

  Membership and        Good direction;                                   P0
  admission             incomplete guarantees   

  Leadership succession Policy is                                         P0
                        unsafe/underspecified   

  Matching mathematics  Useful foundation;                                P1
                        formula incomplete      

  Minimum-size policy   Unresolved business                               P0
                        semantics               

  Invitations and       Important gaps                                    P1
  idempotency                                   

  Real-time event model Good direction;                                   P1
                        ordering contract       
                        incomplete              

  Discovery read model  Appropriate, needs                                P1
                        freshness contract      

  Security/privacy      Good baseline; needs                              P1
                        abuse workflows         

  Architecture scope    Sensible                                         ---

  Innovation claims     Some are capabilities,                            P2
                        not distinct            
                        innovations             
  --------------------------------------------------------------------------

**P0** means resolve before implementing the affected domain.\
**P1** means resolve before calling the implementation
production-ready.\
**P2** means improve positioning or defer without compromising the core
system.

------------------------------------------------------------------------

# 2. Critical findings

## F-01 --- `FULL` is not a recruitment policy

**Priority:** P0\
**Affected sections:** 4.3, 5.2, 6.3, 9, 12

Version 1.0 places `FULL` beside `OPEN`, `PAUSED` and `CLOSED` in
`recruitmentStatus`, then describes `FULL` as derived from membership
count.

This mixes two different concepts:

-   What the leader wants: recruitment policy.
-   What the system observes: available capacity.

It creates an actual state-transition ambiguity.

Example: 1. Leader sets recruitment to `CLOSED`. 2. Team has five
members and maximum size five. 3. One member leaves. 4. Capacity becomes
available. 5. Should the team become `OPEN` or remain `CLOSED`?

If `FULL` overwrites `CLOSED`, the system loses the leader's decision.
If it does not, `FULL` is not a valid value in the same state field.

### Required correction

Use independent dimensions:

**Lifecycle** - `ACTIVE` - `DISBANDED`

**Recruitment policy** - `OPEN` - `PAUSED` - `CLOSED`

**Capacity state --- derived, never independently commanded** -
`AVAILABLE` - `FULL`

**Formation-size state --- derived** - `BELOW_MINIMUM` -
`AT_OR_ABOVE_MINIMUM`

The effective ability to receive a request is a predicate:

\[ CanReceiveRequest(T,H)= Active(T) `\land `{=tex}Policy(T)=OPEN
`\land `{=tex}FormationOpen(H)
`\land `{=tex}ActiveMembers(T)\<MaxSize(T) \]

The actual admission must re-evaluate this predicate at commit time.

Do not persist `FULL` as a leader-controlled state. It can be cached as
a projection, but the authoritative value is computed from the capacity
invariant.

------------------------------------------------------------------------

## F-02 --- Leadership succession must not silently impose responsibility

**Priority:** P0\
**Affected sections:** 3.2, 6.7, 10.1, 10.2

Version 1.0 proposes choosing a successor who has explicitly accepted
willingness to lead, otherwise selecting the earliest-joined eligible
member.

The fallback contradicts the consent-oriented first rule. Joining a team
is not necessarily consent to become its leader.

This can create: - An unwilling leader. - A leader who is inactive or
unavailable. - A dispute about who has authority. - A team that appears
operational but has no functioning decision-maker.

### Required correction

Leadership succession must be an explicit hackathon/team policy, not an
accidental consequence of join order.

Recommended policy:

1.  Team members may declare whether they are willing to assume
    leadership.
2.  A leader may nominate a successor.
3.  A nominated successor must accept the transfer.
4.  If the leader leaves without a completed handover, select from the
    predeclared succession order **only among members who opted in**.
5.  If no eligible successor exists, apply an explicit fallback policy
    configured by the hackathon: block voluntary departure until
    handover, request organizer intervention, or disband the team under
    a clearly documented rule.

For involuntary leader loss (account deletion, suspension or
unavailability), the organizer fallback must be deterministic and
audited.

### Required invariant

For an active, non-empty team:

\[ #ActiveLeaders(T)=1 \]

For a disbanded or empty team:

\[ #ActiveLeaders(T)=0 \]

A leadership transfer must atomically demote the former leader and
promote the successor.

**Do not use "earliest joined member" as a universal fallback unless
every participant explicitly accepted that succession rule when
joining.**

------------------------------------------------------------------------

## F-03 --- The matching utility mixes team value and candidate preference

**Priority:** P1\
**Affected sections:** 7.2, 8.5--8.8

The current equation defines:

\[ `\Delta`{=tex}(c`\mid `{=tex}T,B)=U(T`\cup`{=tex}{c},B)-U(T,B) \]

This is a useful definition of a candidate's marginal contribution to a
team. However, the specification also places candidate preference
compatibility inside the team utility. Candidate preference is not
solely a property of the team composition: it belongs to the
candidate-team relationship.

The current model also leaves several terms undefined: - How are skill
levels aggregated? - How are parent/child skills prevented from being
double-counted? - What does diversity mean mathematically? - How is
availability measured for a team of more than two people? - Can a score
be negative? - What does a score of 80 mean? - Are recommendations for a
leader and recommendations for a participant the same ranking problem?

### Required correction: separate the two sides

Define two independent normalized values.

**A. Team contribution**

\[ V_T(c`\mid `{=tex}T,B)`\in[0,1]`{=tex}\]

Measures how much candidate (c) improves team (T) against blueprint (B),
including skill coverage, role coverage, availability and
critical-capability resilience.

**B. Participant fit**

\[ V_P(T`\mid `{=tex}c)`\in[0,1]`{=tex}\]

Measures whether team (T) fits candidate (c)'s stated preferences:
desired role, skills they want to practise, collaboration availability
and declared working preferences.

Then define a mutual compatibility score:

\[ M(c,T)=`\sqrt{V_T(c\mid T,B)\cdot V_P(T\mid c)}`{=tex} \]

The geometric mean is a proposed policy, not a universal truth. Its
useful property is that a very low score on either side cannot be
completely hidden by a high score on the other side.

The interface must show both components and their explanations. The
score is a ranking aid, **not a probability of team success**.

For a leader-facing candidate list, show team contribution prominently.
For a participant-facing team list, show participant fit prominently.
Both should retain the mutual score as a common comparison if the
product uses one.

### Define a bounded coverage model

For skill (s), let: - (x\_{u,s}`\in[0,1]`{=tex}) be participant (u)'s
declared contribution level for skill (s), mapped by a documented
rule. - (q_s\>0) be the target contribution level required by the
blueprint.

Define:

\[
g_s(T)=`\min`{=tex}`\left`{=tex}(1,`\frac{\sum_{u\in T}x_{u,s}}{q_s}`{=tex}`\right`{=tex})
\]

This is a capped coverage function. It has diminishing returns: once the
target is met, more of the same skill adds no additional coverage.

A weighted skill coverage term is:

\[ G_s(T,B)= `\frac{\sum_{s\in S_B}w_sg_s(T)}`{=tex}
{`\sum`{=tex}\_{s`\in `{=tex}S_B}w_s} \]

where (w_s`\geq0`{=tex}) and the denominator is positive.

This model is simple, bounded and explainable. It is still only as
reliable as the self-declared input data. The UI must say "declared
coverage", not "verified expertise".

### Avoid skill double counting

If `React` is mapped to `Frontend Development`, do not count the same
declaration as two independent full contributions unless the taxonomy
explicitly defines separate dimensions.

Use canonical skill IDs, aliases and a versioned taxonomy. Parent/child
skill relationships must have a documented aggregation rule.

### Define role coverage separately

Roles may be capacity-constrained and mutually exclusive. Do not simply
sum role labels if one participant cannot realistically occupy three
required roles at once.

For the MVP, use explicit role declarations and a bounded role coverage
model. If role assignment becomes a constrained matching problem, model
it separately and compare a deterministic assignment algorithm with
manual leader judgement.

### Define availability using a quorum, not strict all-member intersection

The strict intersection:

\[ `\bigcap`{=tex}\_{u`\in `{=tex}T}A_u \]

can become empty very quickly as team size grows. It treats a team as
having no shared availability even when most members can work together.

A more useful candidate model is:

\[ Q_T(t)= `\mathbf{1}`{=tex}`\left[
\sum_{u\in T}a_u(t)\geq\lceil\rho|T|\rceil
\right]`{=tex}\]

where: - (a_u(t)`\in`{=tex}{0,1}) indicates whether participant (u) is
available at time (t). - (`\rho`{=tex}`\in`{=tex}(0,1\]) is the required
availability quorum.

Then:

\[ G_a(T)=`\frac{1}{\mu(W)}`{=tex}`\int`{=tex}\_WQ_T(t),dt \]

where (W) is the declared planning window.

This measures the fraction of the window in which at least the required
proportion of the team is available. The quorum (`\rho`{=tex}) is a
product policy that must be tested with users; do not claim that one
value is universally correct.

Time zone should be used to display local times and support preferences.
If availability intervals are already normalized to UTC, do not
separately reward time-zone similarity as if it were another independent
measure of actual overlap. That would double-count the same signal.

### Define the team utility

A first measurable model is:

\[ U(T,B)=w_sG_s+w_rG_r+w_aG_a+w_bG_b \]

subject to:

\[ w_s,w_r,w_a,w_b`\geq0`{=tex},`\qquad`{=tex} w_s+w_r+w_a+w_b=1 \]

where: - (G_s): skill coverage. - (G_r): role coverage. - (G_a):
availability quorum. - (G_b): resilience/redundancy for critical
capabilities.

All components must be normalized to (\[0,1\]), and the blueprint must
contain at least one scored dimension.

Candidate marginal contribution remains:

\[ `\Delta `{=tex}U(c`\mid `{=tex}T,B)=U(T`\cup`{=tex}{c},B)-U(T,B) \]

It may be negative if a candidate substantially reduces team
availability or violates a soft composition preference. The eligibility
filter should handle hard constraints; the score should not disguise a
negative contribution as a high positive score.

A proposed normalized team value is:

\[ V_T(c`\mid `{=tex}T,B)= `\operatorname{clip}`{=tex} `\left`{=tex}(
`\frac{\max(0,\Delta U(c\mid T,B))}`{=tex}
{`\max`{=tex}(`\epsilon`{=tex},1-U(T,B))}, 0,1 `\right`{=tex}) \]

This measures the candidate's share of the team's remaining possible
utility. It is a design proposal to validate, not a calibrated measure.

### Mathematical properties and limits

The capped skill coverage function is monotone and submodular when
individual contributions are non-negative and the skill targets are
fixed. Its marginal gain diminishes as more contributors cover the same
skill.

That property does **not** automatically hold for the complete utility
if availability, role assignment or other non-monotone terms are added.
Do not claim the whole matching objective is submodular without proving
the required assumptions.

The geometric mean is symmetric and bounded for inputs in (\[0,1\]), but
it is not a fairness proof and does not establish that recommendations
are unbiased.

------------------------------------------------------------------------

## F-04 --- Capacity correctness depends on the counter invariant

**Priority:** P0\
**Affected sections:** 4.3, 4.4, 9.5, 19

The proposed MongoDB strategy conditionally increments
`teams.memberCount` when `memberCount < maxSize`, then inserts a
membership in the same transaction.

This is a defensible design for a small-team workload, provided every
membership mutation follows the same transaction protocol. However, the
counter is denormalized. MongoDB does not automatically guarantee that
it equals the number of active membership documents.

If the counter is too low, the capacity condition can admit too many
members even though the transaction itself is valid.

### Required correction

Declare the following as a maintained transactional invariant:

\[ Team.memberCount=
#{m`\mid `{=tex}m.teamId=Team.id`\land `{=tex}m.status=ACTIVE} \]

Every operation that changes active membership must update: - Membership
record. - Team counter. - Team version. - Leadership state where
relevant. - Audit event. - Outbox event.

All of these changes must commit or abort together.

### Admission transaction outline

1.  Resolve idempotency key and request hash.
2.  Verify actor authorization.
3.  Start transaction.
4.  Conditionally update the team document using:
    -   Team ID.
    -   Active lifecycle.
    -   Recruitment policy `OPEN`.
    -   `memberCount < maxSize`.
    -   Expected version where applicable.
5.  Increment member count and team version.
6.  Insert active membership.
7.  Consume the invitation or accept the join request.
8.  Insert audit event.
9.  Insert outbox event.
10. Persist the successful idempotency result in the same transaction.
11. Commit.
12. Return the committed result.

The team-document update is the capacity serialization point for
admissions to that team. Competing transactions that update the same
team document may receive write conflicts; retry the **whole
transaction** under a bounded retry policy.

A unique active-membership constraint on `(hackathonId, participantId)`
protects against a participant being admitted to two different teams
concurrently.

### Reconciliation behavior

If reconciliation detects a counter mismatch: - Mark the team as
unavailable for new admissions. - Alert operations. - Recompute the
count from authoritative active membership records. - Repair only
through a documented audited procedure. - Re-enable admissions after
consistency is restored.

Do not silently continue admitting against a known inconsistent counter.

### Alternative worth benchmarking: explicit seats

An alternative is to represent capacity as a fixed set of seat records,
with one unique seat per `(teamId, seatNumber)` and at most one active
occupant per seat.

This makes capacity explicit but adds data and update complexity when
team size changes. It should be benchmarked only if the counter-based
design shows a real contention or integrity limitation. It is not
automatically superior.

------------------------------------------------------------------------

## F-05 --- Idempotency must cover concurrent requests and terminal outcomes

**Priority:** P1\
**Affected sections:** 9.1, 9.7, 16.3

The specification says a retry should recover the result, but does not
define the behavior when two copies of the same request arrive at the
same time, or when the first request receives a terminal rejection.

### Required semantics

An idempotency record should have: - Unique scope and key. - Canonical
request hash. - State: `PROCESSING`, `SUCCEEDED`, `REJECTED`. - Final
response classification. - Result resource IDs where applicable. -
Creation and expiry metadata.

Rules: 1. Same key and same request: return or await the same logical
operation. 2. Same key and different request hash: reject as key misuse.
3. Concurrent copies: only one logical command may execute. 4. Success:
membership and successful idempotency result commit together. 5.
Deterministic terminal rejection (e.g. team full): persist the rejection
result so the same key returns the same result. 6. Transient
infrastructure failure: do not persist a false terminal business result;
retry according to policy. 7. New attempt after a terminal rejection
requires a new idempotency key if the client intends a new decision.

The implementation must define how a `PROCESSING` record is recovered
after a worker crashes. Do not leave permanent processing records.

------------------------------------------------------------------------

## F-06 --- Minimum team size has no complete lifecycle semantics

**Priority:** P0\
**Affected sections:** 4.1, 4.3, 5.3, 6.7, 15, 20, 21

The spec stores `minTeamSize` and `maxTeamSize`, but it does not define
what minimum size means operationally.

Questions left open: - May a team exist below the minimum during
formation? - Can a member leave and take the team below the minimum? -
Can the leader close recruitment while the team is below minimum? - What
happens at the formation deadline? - Can an organizer approve an
undersized team? - Does minimum size apply to team creation, submission
eligibility or both?

### Required correction

Separate: - `formationMinSize`: event-level minimum for a team to be
considered complete/eligible. - `teamMaxSize`: team-level capacity,
bounded by event policy. - `formationDeadline`: event-level cutoff.

Allow a team to exist below minimum during the formation window unless
the hackathon explicitly says otherwise.

At deadline, apply a documented outcome: - `ELIGIBLE` if minimum size
and all required constraints are met. - `UNDER_MINIMUM` if it is still
too small. - `EXEMPTED` only through an auditable organizer override. -
`DISBANDED` only if policy explicitly requires it.

Do not automatically delete an undersized team unless the event rules
say so. A team can be valid as a temporary formation object while not
yet eligible for the hackathon submission.

------------------------------------------------------------------------

## F-07 --- Team creation, profile visibility and membership are not fully reconciled

**Priority:** P1\
**Affected sections:** 3, 4, 6.1, 6.2, 6.4

The spec allows participant profile visibility, participant discovery,
team discovery and invitations, but does not fully define what happens
when a participant: - Is hidden from discovery but directly invited. -
Pauses "looking for a team" while retaining a pending request. - Joins a
team from another session. - Has multiple pending invitations from
different teams. - Leaves one team and is immediately invited to
another.

### Required correction

Model separate facts: - `profileVisibility`: who can see profile
details. - `discoveryParticipation`: whether the participant appears in
public discovery. - `membership`: authoritative active team
relationship. - `pendingInvitations` and `pendingRequests`: independent
workflow records.

Do not encode all of these as one participant lifecycle enum.

A participant may be hidden from discovery and still receive a direct
invitation if policy allows. A participant may have multiple pending
invitations but can only accept one in the same hackathon. Accepting one
should invalidate or mark incompatible invitations as no longer
actionable, with a clear reason.

------------------------------------------------------------------------

## F-08 --- Invitation state and code-claim semantics are incomplete

**Priority:** P1\
**Affected sections:** 4.5, 6.6, 9.2

The document lists invitation states in prose but does not establish a
canonical transition table. It also leaves single-use versus multi-use
shareable code behavior open.

### Required correction

Separate: - Invitation record: who invited whom, to which team, and its
lifecycle. - Invite token: secret credential used to locate/claim the
invitation.

For direct invitations, define transitions:

`PENDING -> ACCEPTED | DECLINED | REVOKED | EXPIRED`

For shareable codes, define a separate policy: - Maximum successful
claims. - Expiration. - Revocation. - Whether the code can be claimed by
a specific participant or any eligible participant. - Whether a failed
admission consumes the token.

Recommended default for the challenge: one successful admission per
shareable code. The token may be retried after a transient failure, but
it is consumed only in the transaction that commits admission.

Use constant-time comparison where appropriate for secret verification,
rate limits and generic error responses to reduce enumeration.

------------------------------------------------------------------------

## F-09 --- Team aggregate versioning needs an explicit event contract

**Priority:** P1\
**Affected sections:** 4.8, 11, 12

The spec proposes `aggregateVersion` and client gap detection, but does
not say which changes increment the team version.

### Required correction

Define a team aggregate version increment for every committed mutation
that changes the team view: - Membership joined/left/removed. -
Leadership changed. - Recruitment policy changed. - Team blueprint
changed. - Team description or discoverability changed. - Team
disbanded.

A client holding version (v) may apply an event with version (v+1). If
it receives a higher version with a gap, it fetches a snapshot. Events
with version (`\leq `{=tex}v) are ignored.

Invitation and join-request entities may also have their own versions. A
team version should not be used as a universal version for every
unrelated object.

### Outbox ordering

An outbox guarantees durable publication intent, not automatically
ordered delivery across multiple workers.

If the UI depends on per-team event order, the publisher must preserve
per-aggregate ordering or the client must reliably detect gaps and
recover from snapshots. The chosen behavior must be tested with
duplicate and out-of-order delivery.

------------------------------------------------------------------------

# 3. Product innovation review

The current six innovations are directionally useful, but they are not
all equally differentiated.

  -----------------------------------------------------------------------------
  Proposal                Assessment                Recommendation
  ----------------------- ------------------------- ---------------------------
  Team Composition        Useful structured product Keep
  Blueprint               capability                

  Marginal Contribution   Strongest algorithmic     Keep and formalize
  Matching                differentiator            

  Formation Readiness Map Good UX representation of Keep, but call it a product
                          underlying metrics        capability rather than a
                                                    standalone algorithmic
                                                    innovation

  Formation Path and      Valuable transparency     Keep
  Decision Explanation    capability                

  Team Recovery           Useful lifecycle          Keep, trigger only on
  Suggestions             capability                meaningful changes

  Admission Decision      Strong                    Keep under
  Trace                   engineering/operational   reliability/observability
                          mechanism, not a          
                          user-facing product       
                          innovation                
  -----------------------------------------------------------------------------

## 3.1 Additional innovation worth exploring --- Composition resilience

A team can have a skill covered by exactly one member. It is technically
covered, but fragile: if that person becomes unavailable, the capability
disappears.

TeamKommit can distinguish: - **Coverage:** at least one member can
contribute the capability. - **Redundancy:** more than one member can
contribute it. - **Criticality:** the blueprint says whether losing the
capability materially affects the team's intended work.

For critical skill (s), define a redundancy target (r_s`\geq1`{=tex}):

\[ g\^{res}\_s(T)=
`\min`{=tex}`\left`{=tex}(1,`\frac{\sum_{u\in T}x_{u,s}}{r_s}`{=tex}`\right`{=tex})
\]

This is a simple coverage-depth signal, not a prediction of team
success.

The product can show: - "Backend is covered by two contributors." -
"Deployment is currently dependent on one participant." - "The team has
no declared substitute for UX research."

This can influence candidate recommendations through the blueprint's
resilience weight.

**Why it matters:** it moves the product beyond "fill missing roles"
toward "form a team that is less fragile when membership or availability
changes."

**Caution:** do not force every skill to have two contributors. That
could make small teams impossible to form. Redundancy targets should
apply only to skills the leader marks as critical.

## 3.2 Counterfactual composition preview

A second valuable capability is a preview of the effect of adding or
losing a candidate.

Before sending an invitation or accepting a request, a leader could
see: - Which gaps would be covered. - Which capabilities remain
single-person dependencies. - Whether availability overlap improves or
decreases. - Whether the team reaches its minimum size. - Whether the
candidate's preferred role fits the team.

This is a counterfactual calculation, not an automatic decision. It
reuses the same versioned scoring model as recommendations and must be
recalculated if the team version changes.

This is more defensible than presenting a generic compatibility
percentage.

------------------------------------------------------------------------

# 4. Additional domain decisions required

These questions should be resolved in the SPEC before the CDC is
written.

## 4.1 Hackathon policy

1.  Can organizers change min/max size after team formation starts?
2.  If policy changes, do existing teams retain their original policy
    snapshot or adopt the new rule?
3.  Does the formation deadline close new admissions only, or also allow
    departures and organizer interventions?
4.  Are teams allowed to proceed below the minimum with an exception?

**Recommendation:** version hackathon team policy. Teams record the
policy version under which they were created. Changes must specify
whether they apply retroactively.

## 4.2 Team membership

1.  Can a participant leave and rejoin the same team?
2.  Can a removed participant rejoin?
3.  Can a participant leave and immediately join another team?
4.  Are pending invitations automatically invalidated after membership
    elsewhere is committed?

**Recommendation:** one active membership per participant/hackathon;
historical membership retained. Rejoining is a new admission with an
explicit policy, not restoration of an old active row.

## 4.3 Leadership

1.  Is succession voluntary, nominated or automatic under a preaccepted
    team rule?
2.  What happens when the leader is suspended?
3.  Can a leader transfer leadership and remain a member?
4.  Can members request a leadership change?

**Recommendation:** make transfer a first-class command with explicit
authorization and audit. Avoid a generic `role` field update endpoint.

## 4.4 Recruitment

1.  Can a leader pause recruitment while requests are pending?
2.  Are pending requests auto-declined when recruitment closes?
3.  Does a team that becomes full retain pending requests?
4.  Can a team reserve a place for an invited participant?

**Recommendation:** requests do not reserve capacity by default. If the
product later supports reservations, model them as expiring capacity
holds with their own invariants and limits.

## 4.5 Matching

1.  Are skill levels self-declared only?
2.  Are skill taxonomies provided by organizers or TeamKommit?
3.  Does a team blueprint define hard requirements or soft preferences?
4.  Should recommendations be reciprocal?
5.  What is the minimum profile completeness for recommendation
    eligibility?

**Recommendation:** keep all skills self-declared in the challenge MVP,
label them as such, and use deterministic explainable scoring. Do not
use AI to infer competence.

------------------------------------------------------------------------

# 5. Recommended corrected domain model

The current domain model should be amended as follows.

## Hackathon

Add: - `teamPolicyVersion` - `formationPolicy` - `formationDeadline` -
`allowUndersizedTeams` - `leaderSuccessionPolicy` - `invitePolicy`

## Team

Keep: - Identity and hackathon reference. - Leader reference. - Size
limits. - Team profile. - Blueprint. - Version.

Change: - `lifecycleStatus`: `ACTIVE | DISBANDED` - `recruitmentPolicy`:
`OPEN | PAUSED | CLOSED` - `memberCount`: transactional aggregate -
`capacityState`: derived - `formationSizeState`: derived -
`teamPolicyVersion`: policy snapshot

## Membership

Add: - `joinedAt` - `leftAt` - `status` - `role` - `leadershipOptIn` -
`membershipVersion` - `exitReason`

Enforce one active membership per `(hackathonId, participantId)`.

## Invitation

Separate invitation lifecycle from token lifecycle. Never store raw
secrets.

## Join request

Add: - `requestVersion` - `decisionReasonCode` - `decidedBy` -
`decidedAt`

## Recommendation result

For reproducibility, store or return: - `modelVersion` -
`blueprintVersion` - `teamVersion` - `candidateProfileVersion` -
`teamContributionScore` - `participantFitScore` - `mutualScore` -
`explanationCodes`

Do not persist recommendation results as authoritative eligibility. They
are snapshots and must be refreshed when relevant versions change.

------------------------------------------------------------------------

# 6. Corrected admission and lifecycle invariants

These invariants should be the basis of property-based tests.

For every active team (T):

\[ 0`\leq `{=tex}ActiveMembers(T)`\leq `{=tex}MaxSize(T) \]

\[ Team.memberCount=ActiveMembers(T) \]

For every participant (u) and hackathon (h):

\[ `\sum`{=tex}\_{T`\in `{=tex}Teams(h)}
`\mathbf{1}`{=tex}\[u`\in `{=tex}ActiveMembers(T)\]`\leq1`{=tex} \]

For every active team with at least one member:

\[ ActiveLeaderCount(T)=1 \]

For every disbanded team:

\[ ActiveMembers(T)=0 \]

For every committed admission: - One active membership exists. - The
team counter increased by exactly one. - The invitation/request source
was consumed or transitioned consistently. - One audit record exists. -
One outbox event exists. - The idempotency result is recoverable.

For every rejected or aborted admission: - No membership was created. -
The team counter did not change. - The invitation/request remains in a
state consistent with the rejection policy. - No success event was
published.

For every team event stream: - Aggregate versions are monotonic. -
Duplicate events do not change client state twice. - A gap triggers
snapshot recovery.

------------------------------------------------------------------------

# 7. Revised validation plan

The existing test plan is good but should be expanded.

## 7.1 Admission race matrix

Run the final-seat test across: - 50 requests to the same team. - 50
requests with different idempotency keys. - 50 duplicate deliveries of
one logical request. - Mixed invitation and join-request admission. -
Same participant competing for two teams. - Leader departure during
admission. - Team recruitment closure during admission. - Invitation
expiry at the commit boundary.

Capture: - Successful admissions. - Business rejections. - Transaction
retries. - Duplicate-key conflicts. - Final membership count. - Final
team counter. - Audit/outbox cardinality.

## 7.2 Lifecycle property tests

Generate command sequences including: - Team creation. - Invitation
issue/revoke/accept. - Join request create/accept/decline/cancel. -
Member leave/remove. - Leader transfer. - Recruitment
pause/close/reopen. - Hackathon formation close. - Organizer
exception. - Team disbandment.

After each committed command, assert all invariants.

## 7.3 Matching evaluation

Do not validate the matching algorithm only with unit tests.

Build a small, manually reviewed evaluation set: - Teams with one
obvious missing role. - Teams with overlapping skill labels. - Teams
with a skill already fully covered. - Teams with no global availability
intersection but good quorum overlap. - Candidates with strong team
contribution but poor personal fit. - Candidates with moderate skill
contribution but excellent personal fit. - Candidates whose addition
reduces availability. - Teams with single-person critical dependencies.

For each scenario: 1. Record expected ranking rationale. 2. Run the
algorithm. 3. Compare rank and explanation. 4. Review disagreements. 5.
Adjust the model only with a documented reason.

Measure: - Precision among top recommendations where human judgments are
available. - Acceptance rate, interpreted cautiously. - Recommendation
diversity. - Profile completeness sensitivity. - Score stability after
unrelated team changes.

Do not tune weights only to maximize invitation acceptance; that can
reward popularity or selection bias.

## 7.4 Performance evaluation

Report separate workloads: - Board read workload. - Participant
recommendation workload. - Team candidate recommendation workload. -
Admission contention workload. - Outbox backlog recovery workload.

A single p95 number for the entire application is not informative.

------------------------------------------------------------------------

# 8. Scope corrections for the challenge

The challenge deadline is close, so the product should not attempt to
implement every post-MVP idea.

### Must implement

1.  Participant profiles and skills.
2.  Hackathon rules and team-size constraints.
3.  Team creation and discovery.
4.  Join requests.
5.  Direct invitations and expiring shareable code.
6.  One authoritative admission protocol.
7.  One-team-per-hackathon enforcement.
8.  Leader departure and transfer.
9.  Team recruitment state.
10. Real-time updates with recovery.
11. Audit/outbox.
12. Deterministic explainable matching.
13. Concurrency tests, seed dataset and load report.

### Implement a thin but real version

-   Team composition blueprint.
-   Formation readiness dimensions.
-   Candidate marginal contribution.
-   Counterfactual composition preview.

### Defer

-   Global optimal team assignment.
-   Machine-learning matching.
-   Advanced skill inference.
-   Complex fairness queues.
-   Full chat or collaboration suite.
-   Generic workflow engine.
-   Microservices and Kafka.

The challenge is won by a coherent, demonstrably correct team-formation
product, not by the number of subsystems.

------------------------------------------------------------------------

# 9. Final architecture decision

**Do not replace the modular monolith.** The current architecture
direction is appropriate for the workload and deadline.

Keep: - React + TypeScript. - Node.js + TypeScript + Express. - MongoDB
with transaction support. - A single admission application service. -
Transactional audit and outbox writes. - A background
publisher/projection worker. - WebSocket or SSE selected from the actual
UX needs.

Strengthen: - Team state model. - Leadership policy. - Idempotency state
machine. - Capacity counter invariant. - Event ordering contract. -
Versioned recommendation model. - Policy versioning.

Do not introduce: - Kafka without a demonstrated throughput/retention
need. - Redis locks as a correctness mechanism. - Microservices. -
AI-based skill scoring. - A generic rules engine.

------------------------------------------------------------------------

# 10. Go / no-go checklist for SPEC 1.1

The SPEC is ready to become a CDC when the following are explicitly
decided:

-   [ ] Recruitment policy and capacity state are separate.
-   [ ] Minimum team size and deadline semantics are defined.
-   [ ] Leadership succession and consent policy are defined.
-   [ ] Membership history and rejoin policy are defined.
-   [ ] Invitation and shareable-code transitions are defined.
-   [ ] Idempotency covers concurrent retries and terminal outcomes.
-   [ ] Counter consistency is an explicit transactional invariant.
-   [ ] Team aggregate version semantics are defined.
-   [ ] Matching separates team contribution from participant fit.
-   [ ] Availability uses a documented team-level overlap policy.
-   [ ] Skill normalization and duplicate-skill aggregation are defined.
-   [ ] Recommendation explanations are generated from versioned facts.
-   [ ] The challenge MVP is separated from post-MVP concepts.
-   [ ] Each core invariant has at least one automated test.

**Final decision:** Version 1.0 is a strong conceptual foundation, but
should be revised to version 1.1 before implementation. The
highest-value work is precision in the domain model and algorithms, not
additional infrastructure.

------------------------------------------------------------------------

## Appendix --- Architecture review principle

A system is not rigorous because it contains transactions, events,
indexes, queues or mathematical notation. It is rigorous when:

1.  Its domain concepts are unambiguous.
2.  Its invariants are stated precisely.
3.  Its algorithms have explicit assumptions.
4.  Its failure behavior is defined.
5.  Its guarantees follow from the implementation model.
6.  Its claims are demonstrated by reproducible tests.
7.  Its complexity is justified by measurable product value.

That is the standard TeamKommit should meet.
