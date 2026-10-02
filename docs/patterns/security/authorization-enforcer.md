---
title: Authorization Enforcer (RBAC)
description: Centralizes checking what a role is allowed to do
area: security
owner: Oleksandr Derechei
tags: [security, access-control]
status: stable
aliases: [RBAC, authz, PEP]
solves: [a user changed the id in the URL and pulled up another customer record, checking whether someone is an admin is copy-pasted in forty places and each copy is slightly different, compliance asked me who can delete records and I had to grep the whole codebase to answer, giving a new team read-only access requires a code change and a deploy, a regular user reached an endpoint that was only ever meant for staff]
---

# Authorization Enforcer (RBAC)

Centralizes every check of what a role is allowed to do into one enforcement point, so an action is granted or refused the same way everywhere it's requested.

## What it is
<!--meta block=description-->

An **authorization enforcer** is the single choke point every access decision passes through: given a subject, an action, and a resource, it answers one question — is this allowed? — and the rest of the system defers to that answer instead of deciding for itself. In its most common form, **role-based access control (RBAC)**, the subject's identity is first mapped to one or more roles, and each role carries a fixed set of permissions; the enforcer checks the requested action against the roles held, never against the user directly.

The force it resolves is **authorization sprawl**. Left unchecked, "can this user do this?" gets copy-pasted into controllers, services, templates, and background jobs, each with its own slightly different logic. One missed check is a privilege-escalation bug waiting to be found; one inconsistent check is a silent hole nobody notices until an audit or an incident does it for them. Centralizing the decision means there is exactly one place to get it right, one place to test, and one place to update when a role's permissions change.

The enforcer sits at a fixed point in the request path — middleware, a decorator, a policy call before the handler runs — deliberately decoupled from where the role-to-permission mapping actually lives. That mapping can sit in code, in a database table, or behind an external policy service, and swapping the source never touches a call site.

## Explained
<!--meta block=explain-->

An authorization enforcer is one place that answers the question can this person do this action on this thing, and every other part of the system accepts its answer. Without it, the check gets copied into controllers, services and background jobs, each slightly different, and one missing check lets an ordinary user do an administrator's task. Choose it over checks written inside each handler when permissions change often or must be audited, because you then change a role once and it takes effect everywhere, and you read one policy to see who can do what. It costs four things. A role for every edge case multiplies roles until they are per-user exceptions, so keep roles few and coarse. Coarse roles over-grant, so give the enforcer the resource as well as the role, for rules like only the owner may edit. It is a hot path and one point of failure, so keep decisions fast and make a failure deny. And rules about time or location need extra inputs, so pass them in deliberately.

**Example.** A document service has viewer, editor and admin roles, and DELETE /documents/42 needs admin. A viewer hides nothing by removing the delete button: they send the request by hand with curl. The enforcer looks up viewer, finds no delete permission and answers 403 before the handler runs. Without it, one of 30 handlers that forgot its check would delete the document. The cost shows with the rule editors edit only their own documents. That is not a role, so adding one per team gives 200 roles for 200 teams. Instead the enforcer receives the document owner with each call and compares it to the caller.

## How it works
<!--meta block=structure-->

```mermaid caption="What stops a handler from deciding for itself who may delete a document? Step 3 answers subject, action and resource in one place, so a permission change lands everywhere at once and step 5 hands the handler an action already known to be allowed."
flowchart LR
    Cl["Caller"]:::ext
    AE["Authentication enforcer"]:::ext
    subgraph PDP["One place decides allow or deny"]
        Enf["Authorization enforcer"]
        Policy[("Roles and permissions")]
    end
    H["Request handler"]
    Cl -->|"1 request: this action, this resource"| AE
    AE -->|"2 hand on the verified identity"| Enf
    Enf -->|"3 which roles, and what may they do?"| Policy
    Enf -->|"4 not permitted: 403, stops here"| Cl
    Enf -->|"5 permitted: run the action"| H
    classDef ext stroke-dasharray:4 4
```

## Variations
<!--meta block=variations-->

- **Attribute-Based Access Control (ABAC)** — Decisions weigh attributes of subject, resource, and environment — department, classification, time of day — instead of a fixed role, at the cost of rules that are harder to audit at a glance.
- **Access Control Lists (ACL)** — Permissions attach directly to each resource as a list of subjects allowed to act on it — fine-grained, but unwieldy once resources number in the thousands.
- **Policy-based / externalized authorization** — Push the decision out to a policy engine (Open Policy Agent (OPA)/Rego, Cedar) that evaluates rules against a request — keeps policy versioned and testable independently of application code.
- **Relationship-Based Access Control (ReBAC)** — Access follows a graph of relationships between subjects and resources — "member of," "owns," "shared with" — the model behind Google Zanzibar and most modern sharing permissions.
- **Role hierarchy** — Roles inherit permissions from parent roles, so "Admin" gets everything "Editor" gets plus more, without every grant being repeated per role.

## Trade-offs
<!--meta block=tradeoffs-->

### Pros
<!--meta polarity=pro-->

- **Centralizes every access decision** in one auditable place instead of scattered checks.
- **Changing a role's permissions takes effect everywhere** at once, with no code redeploy.
- **Makes "who can do what" answerable** by reading one policy, not grepping the codebase.
- **Decouples the decision itself** from where the role-to-permission mapping is stored.

### Cons
<!--meta polarity=con-->

- **Role explosion** — a role for every edge case — collapses back into per-user special-casing.
- **Coarse roles either over-grant** permissions or force awkward role-splitting to stay precise.
- **The enforcer is a single point** of failure and a hot path that has to stay fast.
- **Doesn't capture context-dependent rules** — ownership, time, location — without extra machinery.

## When to use it
<!--meta block=usage-->

### Reach for it when
<!--meta polarity=when-->

- **Multiple roles need different**, well-defined sets of permissions across the system.
- **You need one auditable place** to answer "who can do what" for a security or compliance review.
- **Permissions change often enough** that hard-coding a check per call site is unsustainable.

### Avoid when
<!--meta polarity=avoid-->

- **Rules depend heavily on resource attributes or relationships** — reach for ABAC or ReBAC instead.
- **There's effectively one role** — every authenticated user can do everything — so the check is a no-op.
- **Permissions genuinely differ per individual**, not per role — a role invented per user isn't RBAC.

## Code sketch
<!--meta block=sketch-->

```typescript summary="TypeScript — a minimal RBAC enforcer"
type Role = "viewer" | "editor" | "admin";

const permissions: Record<Role, Set<string>> = {
  viewer: new Set(["read"]),
  editor: new Set(["read", "write"]),
  admin: new Set(["read", "write", "delete"]),
};

class AuthorizationEnforcer {
  constructor(private readonly rolesOf: (userId: string) => Role[]) {}

  can(userId: string, action: string): boolean {
    return this.rolesOf(userId).some((role) => permissions[role].has(action));
  }

  enforce(userId: string, action: string): void {
    if (!this.can(userId, action)) {
      throw new Error(`forbidden: ${action}`); // nothing past this line runs
    }
  }
}

// Every mutating call passes through the same gate.
const authz = new AuthorizationEnforcer(getUserRoles);
authz.enforce(currentUser.id, "delete");
await documents.delete(docId);
```

## In the wild
<!--meta block=wild-->

- **Open Policy Agent** — A general-purpose policy decision point: applications ask OPA whether an action is allowed and it evaluates Rego policies against the request. Policy and data are distributed as bundles the agent polls on an interval, and every decision can be emitted to a decision log for audit. {#wild-open-policy-agent}
- **Kubernetes RBAC** — Role and ClusterRole objects define permissions; RoleBinding and ClusterRoleBinding attach them to subjects. With the RBAC authorization mode enabled, the API server checks every request against the bindings and denies by default — a subject with no binding can do nothing. {#wild-kubernetes-rbac}
- **AWS identity and access management (IAM)** — Every API call is evaluated against attached identity-based and resource-based policies in one central decision point. Access is denied by default, an explicit Deny always overrides an Allow, and the effective decision is the combined result of all applicable policies. {#wild-aws-iam}

## In production
<!--meta block=production-->

### Tuning knobs
<!--meta polarity=knob-->

- **Default effect (deny-by-default)** — What happens to a request that matches no rule. Deny-by-default is the safe setting: an unmatched action is refused. Flipping to allow-by-default turns every gap in the policy into an open door.
- **Decision cache time to live (TTL)** — How long an allow/deny decision is memoized before re-evaluation. Longer cuts evaluation cost on hot paths but means a revoked permission can still be honored until the entry expires.
- **Policy / role-data refresh interval** — How often the enforcer pulls updated roles and policy from its source (a bundle server, a database, an external PDP). Sets the ceiling on how long a permission change takes to take effect everywhere.
- **Deployment topology (local PDP vs remote decision service)** — A colocated sidecar or embedded library keeps decision latency and availability under local control; a central remote service is easier to govern but adds a network hop and a shared dependency to every request.

### Signals to watch
<!--meta polarity=signal-->

- **403 / denial rate** — A jump after a policy change usually means over-restriction (a needed grant was dropped); an unexpected drop toward zero can mean over-grant or a check being skipped.
- **Authorization decision latency (p99)** — Time to evaluate a single allow/deny on the request path. It sits in front of every protected action, so tail latency here is user-visible latency everywhere.
- **Policy / role-data staleness** — Age of the policy and role mapping the enforcer is actually using versus the source of truth. Rising staleness means revocations and new grants are not yet in effect.
- **Decision cache hit ratio** — Fraction of decisions served from cache versus fully re-evaluated. A falling ratio predicts rising evaluation cost and latency on the hot path.

### Failure modes under load
<!--meta polarity=failure-->

- **Policy engine unreachable** — The central decision point goes down. Deny-by-default then locks legitimate users out of everything (availability outage); allow-by-default silently grants everything (security breach). Either way the blast radius is every protected action.
- **Stale policy after a revocation** — A role loses a permission but the enforcer keeps an old cached decision or an un-refreshed policy copy, so the revoked action keeps succeeding until the cache/bundle refreshes.
- **Over-broad role (privilege creep)** — Coarse or accreted roles grant more than any holder needs; a compromised or mistaken account can then do far more than intended. The failure is invisible until an audit or incident surfaces it.
- **Slow evaluation on the hot path** — Complex rules or a slow remote PDP add latency to every request; under load the enforcer becomes the bottleneck it was meant to centralize away.

### Readiness checklist
<!--meta polarity=check-->

- Confirm the default effect is deny: a request matching no rule is refused, not allowed.
- Verify every mutating path routes through the enforcer — grep for inline permission checks that decide on their own.
- Test that revoking a permission takes effect within the refresh/cache window you claim, not just eventually.
- Load-test decision latency on the hot path with the decision cache cold.
- Decide and document the fail mode when the policy source is unreachable — fail closed unless a route has a stated reason not to.

## Where it shows up
<!--meta block=fluency-->

<!-- fluency:start -->

<!-- GENERATED by gen-tours from docs/data/learning-paths.json. Do not edit this block. -->

- [Auth & Access](../../themes/auth-and-access.md) — Decide what the role may do {#fluency-auth-and-access}

<!-- fluency:end -->

## How it relates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

**Combines with**

- [Least Privilege](./least-privilege.md) — Grant only what the role needs
- [Secure Session Manager](./secure-session-manager.md) — Reads the identity and roles the session carries forward
- [Identity Is the Perimeter](../../principles/identity-as-perimeter.md) — Authorization is the half of the boundary that identity alone cannot cover

**Requires**

- [Authentication Enforcer](./authentication-enforcer.md) — Needs a verified identity to check, since a role check means nothing before you know who is asking; identity and permission are distinct steps

**Implemented by**

- [Identity & Access](../../capabilities/identity.md) — The cloud's IAM engine is this, applied to every resource.
- [Resource Organisation](../../capabilities/resources.md) — Service control policies, Azure Policy and Organization Policy are decision points above the account, consulted on every control-plane call.

<!-- relationships:end -->
