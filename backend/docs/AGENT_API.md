# Hiro Agent API 

Isolated API for external AI agents. Separate login from staff users. Only routes under `/api/agent/*` are available to agents.

**Base URL:** `http://localhost:4000` (or your deployed API host)

All authenticated requests require:

```http
Authorization: Bearer <accessToken>
```

---

## Table of contents

1. [Quick start](#quick-start)
2. [Authentication & scopes](#authentication) · [Scopes table](#scopes)
3. [Tag AI decisions](#tag-ai-decisions) — includes [retrieval diagnostics](#retrieval-diagnostics)
4. [Organization AI decisions](#organization-ai-decisions)
5. [Tag catalog (read/write)](#tag-catalog-read) — [merge](#post-apiagenttagsmerge), [remove synonyms](#patch-apiagenttagsidexecute)
6. [Organizations (read/write)](#organizations-read) — [merge](#post-apiagentorganizationsmerge), [remove aliases](#patch-apiagentorganizationsidexecute)
7. [Staging company write](#staging-company-write)
8. [Agent audit logs](#agent-audit-logs)
9. [Client CRM (links & contacts)](#client-crm-links--contacts)
10. [Endpoint summary](#endpoint-summary)
11. [Error responses](#error-responses)

---

## Quick start

```bash
# 1. Login and save token
TOKEN=$(curl -s -X POST http://localhost:4000/api/agent/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"agent1","password":"hiroagent1234"}' \
  | jq -r .accessToken)

# 2. Verify
curl -s http://localhost:4000/api/agent/health \
  -H "Authorization: Bearer $TOKEN"
```

---

## Authentication

Agents do **not** use `/api/auth/login`. Credentials are configured in `backend/src/services/agentAuthService.js`.

| Field | Value |
|-------|-------|
| Username | `agent1` |
| Password | `hiroagent1234` |

### POST `/api/agent/auth/login`

Scope: none (public)

```bash
curl -s -X POST http://localhost:4000/api/agent/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "agent1",
    "password": "hiroagent1234"
  }'
```

**Response `200`:**

```json
{
  "accessToken": "<jwt>",
  "tokenType": "Bearer",
  "expiresIn": "30m",
  "agent": {
    "id": "agent1",
    "username": "agent1",
    "name": "Agent",
    "scopes": [
      "agent:ping",
      "agent:tag-ai-decisions:read",
      "agent:tag-ai-decisions:write",
      "agent:organization-ai-decisions:read",
      "agent:organization-ai-decisions:write",
      "agent:organizations:read",
      "agent:organizations:write",
      "agent:tags:read",
      "agent:tags:write",
      "agent:clients:read",
      "agent:clients:write",
      "agent:audit-logs:read"
    ]
  }
}
```

### Environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AGENT_JWT_SECRET` | Signing secret for agent tokens | falls back to `JWT_SECRET` |
| `AGENT_JWT_EXPIRES_IN` | Token lifetime | `30m` |

---

## Scopes

| Scope | Access |
|-------|--------|
| `agent:ping` | Health check, agent identity |
| `agent:tag-ai-decisions:read` | List/get tag AI decisions |
| `agent:tag-ai-decisions:write` | Patch / execute tag AI decisions |
| `agent:organization-ai-decisions:read` | List/get organization AI decisions |
| `agent:organization-ai-decisions:write` | Patch / execute organization AI decisions |
| `agent:organizations:read` | List/get live organizations |
| `agent:organizations:write` | Enrich, merge, and maintain live organizations (`/execute`) |
| `agent:tags:read` | List/get catalog tags |
| `agent:tags:write` | Merge catalog tags and maintain synonyms (`/execute`) |
| `agent:clients:read` | List client contacts |
| `agent:clients:write` | Link organizations to clients; create/update/delete contacts |
| `agent:audit-logs:read` | Query structured agent audit logs |

---

## Health & identity

### GET `/api/agent/health`

Scope: `agent:ping`

```bash
curl -s http://localhost:4000/api/agent/health \
  -H "Authorization: Bearer $TOKEN"
```

**Response `200`:**

```json
{
  "status": "ok",
  "service": "hiro-agent-api"
}
```

---

### GET `/api/agent/capabilities`

Scope: `agent:ping`

Returns a machine-readable catalog of what the agent can and cannot do (mirrors the internal Notion capability matrix).

```bash
curl -s http://localhost:4000/api/agent/capabilities \
  -H "Authorization: Bearer $TOKEN"
```

**Response `200`:**

```json
{
  "data": [
    {
      "id": "clients.contacts.update",
      "title": "עריכת איש קשר קיים",
      "domain": "לקוחות ואנשי קשר",
      "status": "available",
      "description": "עדכון פרטים של איש קשר קיים (טלפון, תפקיד, מייל, הגדרות דיוור).",
      "note": null,
      "endpoint": "PATCH /api/agent/clients/:clientId/contacts/:contactId",
      "scope": "agent:clients:write"
    }
  ]
}
```

Each item: `status` is `available` or `unavailable`; `endpoint` / `scope` are `null` when blocked.

---

### GET `/api/agent/me`

Scope: `agent:ping`

```bash
curl -s http://localhost:4000/api/agent/me \
  -H "Authorization: Bearer $TOKEN"
```

**Response `200`:**

```json
{
  "agent": {
    "id": "agent1",
    "username": "agent1",
    "name": "Agent",
    "scopes": ["agent:ping", "..."]
  }
}
```

---

## Tag AI decisions

### GET `/api/agent/tag-ai-decisions`

Scope: `agent:tag-ai-decisions:read`

List tag correction decisions with pagination and filters.

**Query parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | number | `1` | Page number |
| `limit` | number | `25` | Page size (max `100`) |
| `sortOrder` | `asc` \| `desc` | `desc` | Sort by `createdAt` |
| `reviewStatus` | string | — | e.g. `pending_review`, `approved`, `manual_queue`, `overridden` |
| `manualApprovalStatus` | string | — | e.g. `pending`, `approved`, `agent_approved` |
| `approvalStatus` | string | — | Alias for `manualApprovalStatus` |
| `decision` | string | — | Filter by `aiDecision`: `merge`, `create`, `delete`, … |
| `dateFrom` | `YYYY-MM-DD` | — | Start of date range (inclusive) |
| `dateTo` | `YYYY-MM-DD` | — | End of date range (inclusive) |
| `date` | `YYYY-MM-DD` | — | Single day (alternative to range) |
| `agentVerdict` | string | — | Partial match on agent verdict text |
| `hasAgentVerdict` | boolean | — | `true` = has verdict, `false` = empty |
| `search` | string | — | Match `originalTerm` (min 3 chars) |
| `type` | string | — | Filter `detectedType`: `skill`, `education`, … |

```bash
curl -s "http://localhost:4000/api/agent/tag-ai-decisions?reviewStatus=pending_review&limit=10&sortOrder=desc" \
  -H "Authorization: Bearer $TOKEN"
```

```bash
curl -s "http://localhost:4000/api/agent/tag-ai-decisions?dateFrom=2026-09-01&dateTo=2026-09-14&hasAgentVerdict=false" \
  -H "Authorization: Bearer $TOKEN"
```

**Response `200`:**

```json
{
  "data": [
    {
      "id": "uuid",
      "originalTerm": "React",
      "detectedType": "skill",
      "contextSample": "...",
      "aiDecision": "merge",
      "aiSuggestedTarget": "React.js",
      "aiReasoning": "...",
      "hesitationLevel": 45,
      "dilemmaReasoning": null,
      "reviewStatus": "pending_review",
      "manualApprovalStatus": "pending",
      "agentNotes": null,
      "agentVerdict": null,
      "candidateCount": 8,
      "candidateTagsSnapshot": [
        {
          "rank": 1,
          "tagId": "uuid",
          "tagKey": "react_js",
          "name": "React.js",
          "source": "vector",
          "similarityScore": 0.91
        }
      ],
      "retrieval": {
        "k": 8,
        "candidates": []
      },
      "createdAt": "2026-09-09T08:00:00.000Z"
    }
  ],
  "total": 100,
  "page": 1,
  "limit": 10,
  "totalPages": 10
}
```

---

### GET `/api/agent/tag-ai-decisions/:id`

Scope: `agent:tag-ai-decisions:read`

```bash
curl -s "http://localhost:4000/api/agent/tag-ai-decisions/550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer $TOKEN"
```

**Response `200`:**

```json
{
  "data": {
    "id": "uuid",
    "originalTerm": "React",
    "detectedType": "skill",
    "contextSample": "...",
    "aiDecision": "merge",
    "aiSuggestedTarget": "React.js",
    "aiReasoning": "...",
    "hesitationLevel": 45,
    "dilemmaReasoning": null,
    "reviewStatus": "pending_review",
    "manualApprovalStatus": "pending",
    "agentNotes": null,
    "agentVerdict": null,
    "candidateCount": 8,
    "candidateTagsSnapshot": [],
    "retrieval": { "k": 8, "candidates": [] },
    "createdAt": "2026-09-09T08:00:00.000Z"
  }
}
```

### Retrieval diagnostics {#retrieval-diagnostics}

Each tag decision includes the **pgvector hybrid snapshot** that was shown to Gemini before the AI judgment. Use this to distinguish:

| Scenario | What you see |
|----------|----------------|
| **Retrieval problem** | The correct catalog tag never appears in `candidateTagsSnapshot` / `retrieval.candidates` |
| **Judgment problem** | The correct tag appears in the list, but `aiDecision` / `aiSuggestedTarget` chose differently |

**Fields (list, get, and `/candidates`):**

| Field | Description |
|-------|-------------|
| `candidateCount` | Same as `retrieval.k` — number of candidates shown |
| `retrieval.k` | Explicit count of candidates in the snapshot |
| `retrieval.candidates` | Ordered array of candidates |
| `candidateTagsSnapshot` | Alias of `retrieval.candidates` (same shape) |

**Each candidate object:**

| Field | Type | Description |
|-------|------|-------------|
| `rank` | number | 1-based position in the snapshot |
| `tagId` | UUID \| null | Catalog tag id when known |
| `tagKey` | string \| null | Catalog tag key when known (present on new snapshots; may be `null` on older rows) |
| `name` | string | Display label shown to Gemini |
| `source` | `"vector"` \| `"fuzzy"` | How the candidate was retrieved |
| `similarityScore` | number \| null | Cosine similarity (vector hits only; `null` for fuzzy) |

Typical hybrid search returns up to **7 vector + 3 fuzzy** candidates (max **10** total after dedupe). The actual `k` is always returned in the response.

---

### GET `/api/agent/tag-ai-decisions/:id/candidates`

Scope: `agent:tag-ai-decisions:read`

Read-only retrieval snapshot for a single decision (lighter than full GET when you only need pgvector candidates).

**Response `200`:**

```json
{
  "data": {
    "decisionId": "uuid",
    "originalTerm": "React",
    "candidateCount": 8,
    "k": 8,
    "candidates": [
      {
        "rank": 1,
        "tagId": "uuid",
        "tagKey": "react_js",
        "name": "React.js",
        "source": "vector",
        "similarityScore": 0.91
      }
    ]
  }
}
```

---

### PATCH `/api/agent/tag-ai-decisions/:id`

Scope: `agent:tag-ai-decisions:write`

Update **only** `agentNotes` and/or `agentVerdict`. Does not execute review actions.

Rules:
- Only `agentNotes` and `agentVerdict` accepted; other fields → `400 Forbidden fields: ...`
- At least one field required
- Max `10000` chars per field
- Send `null` or `""` to clear

```bash
curl -s -X PATCH "http://localhost:4000/api/agent/tag-ai-decisions/550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "agentVerdict": "merge looks correct",
    "agentNotes": "High confidence — same technology"
  }'
```

**Response `200`:**

```json
{
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "agentNotes": "High confidence — same technology",
    "agentVerdict": "merge looks correct"
  }
}
```

---

### PATCH `/api/agent/tag-ai-decisions/:id/execute`

Scope: `agent:tag-ai-decisions:write`

Execute review actions (same capabilities as staff `/api/tags/ai-decisions/*`). Body must include `operation`.

#### `operation: "resolve"`

Apply a reviewer action to the decision and its pending tag.

| Field | Required | Description |
|-------|----------|-------------|
| `operation` | yes | `"resolve"` |
| `action` | yes | `merge`, `create`, `blacklist`, `manual`, `undo_manual`, `undo_blacklist` |
| `targetTagId` | for `merge` | UUID of target catalog tag |
| `aliasPriority` | no | Default `3` |

```bash
curl -s -X PATCH "http://localhost:4000/api/agent/tag-ai-decisions/550e8400-e29b-41d4-a716-446655440000/execute" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "resolve",
    "action": "merge",
    "targetTagId": "660e8400-e29b-41d4-a716-446655440001"
  }'
```

```bash
curl -s -X PATCH "http://localhost:4000/api/agent/tag-ai-decisions/550e8400-e29b-41d4-a716-446655440000/execute" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "resolve",
    "action": "create"
  }'
```

```bash
curl -s -X PATCH "http://localhost:4000/api/agent/tag-ai-decisions/550e8400-e29b-41d4-a716-446655440000/execute" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "resolve",
    "action": "manual"
  }'
```

**Response `200`:**

```json
{
  "success": true,
  "resolvedIds": ["550e8400-e29b-41d4-a716-446655440000"]
}
```

#### `operation: "approve"`

Set manual approval status.

| Field | Required | Description |
|-------|----------|-------------|
| `operation` | yes | `"approve"` |
| `status` | no | `pending`, `approved`, `agent_approved` (default: `approved`) |

```bash
curl -s -X PATCH "http://localhost:4000/api/agent/tag-ai-decisions/550e8400-e29b-41d4-a716-446655440000/execute" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "approve",
    "status": "agent_approved"
  }'
```

**Response `200`:**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "manualApprovalStatus": "agent_approved"
}
```

#### `operation: "comments"`

Update internal comments (not exposed in agent list/get DTO).

```bash
curl -s -X PATCH "http://localhost:4000/api/agent/tag-ai-decisions/550e8400-e29b-41d4-a716-446655440000/execute" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "comments",
    "comments": "Reviewed by external agent"
  }'
```

**Response `200`:**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "comments": "Reviewed by external agent"
}
```

#### `operation: "fields"`

Update text fields without changing review status.

Allowed: `comments`, `agentNotes`, `agentVerdict` (at least one required).

```bash
curl -s -X PATCH "http://localhost:4000/api/agent/tag-ai-decisions/550e8400-e29b-41d4-a716-446655440000/execute" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "fields",
    "agentNotes": "Checked against catalog",
    "agentVerdict": "Approve merge"
  }'
```

**Response `200`:**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "comments": null,
  "agentNotes": "Checked against catalog",
  "agentVerdict": "Approve merge",
  "userVerdict": null
}
```

---

## Organization AI decisions

### GET `/api/agent/organization-ai-decisions`

Scope: `agent:organization-ai-decisions:read`

List company-name correction decisions.

**Query parameters:** same shared filters as tag list, plus:

| Param | Type | Description |
|-------|------|-------------|
| `search` | string | Match `originalTerm` or `aiSuggestedTarget` (min 3 chars) |

```bash
curl -s "http://localhost:4000/api/agent/organization-ai-decisions?reviewStatus=pending_review&limit=25" \
  -H "Authorization: Bearer $TOKEN"
```

```bash
curl -s "http://localhost:4000/api/agent/organization-ai-decisions?search=Acme&dateFrom=2026-09-01&decision=merge_company" \
  -H "Authorization: Bearer $TOKEN"
```

```bash
curl -s "http://localhost:4000/api/agent/organization-ai-decisions?agentVerdict=approve&hasAgentVerdict=true" \
  -H "Authorization: Bearer $TOKEN"
```

**Response `200`:**

```json
{
  "data": [
    {
      "id": "uuid",
      "originalTerm": "Acme Ltd",
      "aiDecision": "merge_company",
      "aiSuggestedTarget": "Acme Corporation",
      "aiReasoning": "...",
      "hesitationLevel": 20,
      "dilemmaReasoning": null,
      "similarEntities": [{ "name": "Acme Corp", "similarity": 0.92 }],
      "reviewStatus": "pending_review",
      "manualApprovalStatus": "pending",
      "agentNotes": null,
      "agentVerdict": null,
      "context": "resume",
      "createdAt": "2026-09-09T08:00:00.000Z"
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 25,
  "totalPages": 2
}
```

---

### GET `/api/agent/organization-ai-decisions/:id`

Scope: `agent:organization-ai-decisions:read`

Returns the decision plus **staging company** data from `OrganizationTmp` (not the live `Organization` record). Staging data is grouped by field category for agent review.

```bash
curl -s "http://localhost:4000/api/agent/organization-ai-decisions/770e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer $TOKEN"
```

**Response `200`:**

```json
{
  "data": {
    "id": "770e8400-e29b-41d4-a716-446655440000",
    "originalTerm": "Acme Ltd",
    "aiDecision": "create_company",
    "aiSuggestedTarget": null,
    "aiReasoning": "...",
    "hesitationLevel": 55,
    "dilemmaReasoning": null,
    "similarEntities": [],
    "reviewStatus": "manual",
    "manualApprovalStatus": "pending",
    "agentNotes": null,
    "agentVerdict": null,
    "context": "resume",
    "createdAt": "2026-09-09T08:00:00.000Z",
    "stagingCompany": {
      "id": "880e8400-e29b-41d4-a716-446655440000",
      "name": "Acme Ltd",
      "nameEn": "Acme Ltd",
      "legalName": null,
      "aliases": [],
      "isCompany": true,
      "fieldGroups": {
        "business": {
          "mainField": "הייטק",
          "subField": "SaaS",
          "secondaryField": null,
          "businessModel": "B2B",
          "productType": "Software",
          "type": "פרטי",
          "classification": "פרטית",
          "relation": null
        },
        "organizationalStructure": {
          "structure": "חברה עצמאית (ללא שיוך)",
          "parentCompany": null,
          "subsidiaries": []
        },
        "scaleAndGrowth": {
          "employeeCount": "(Growth) 51-200",
          "growthIndicator": "Growing",
          "foundedYear": "2015",
          "dataConfidence": null,
          "lastVerified": null,
          "candidateCount": 3
        },
        "addresses": {
          "location": "תל אביב",
          "hqCountry": "Israel",
          "website": "https://acme.example",
          "linkedinUrl": null
        },
        "technologyAndTagging": {
          "techTags": ["React", "Node.js"],
          "tags": ["SaaS", "B2B"],
          "description": "Cloud platform for ..."
        }
      }
    }
  }
}
```

`stagingCompany` is `null` when the decision has no linked `OrganizationTmp` record.

---

### PATCH `/api/agent/organization-ai-decisions/:id`

Scope: `agent:organization-ai-decisions:write`

Update **only** `agentNotes` and/or `agentVerdict`. Same rules as tag PATCH.

```bash
curl -s -X PATCH "http://localhost:4000/api/agent/organization-ai-decisions/770e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "agentVerdict": "create_company is correct",
    "agentNotes": "No duplicate in catalog"
  }'
```

**Response `200`:**

```json
{
  "data": {
    "id": "770e8400-e29b-41d4-a716-446655440000",
    "agentNotes": "No duplicate in catalog",
    "agentVerdict": "create_company is correct"
  }
}
```

---

### PATCH `/api/agent/organization-ai-decisions/:id/execute`

Scope: `agent:organization-ai-decisions:write`

Execute review actions (same capabilities as staff `/api/organizations/ai-decisions/*`).

#### `operation: "resolve"`

Apply reviewer resolution — may update review status, create staging org, add aliases, migrate candidate links.

| Field | Required | Description |
|-------|----------|-------------|
| `operation` | yes | `"resolve"` |
| `reviewerAction` | no | e.g. `merge_company`, `create_company`, `map_generic` |
| `reviewStatus` | no | e.g. `approved`, `manual`, `changed` |
| `aiDecision` | no | Override AI decision |
| `aiSuggestedTarget` | no | Target company name |
| `aiSuggestedTargetId` | no | Target organization UUID |

```bash
curl -s -X PATCH "http://localhost:4000/api/agent/organization-ai-decisions/770e8400-e29b-41d4-a716-446655440000/execute" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "resolve",
    "reviewerAction": "merge_company",
    "reviewStatus": "approved",
    "aiDecision": "merge_company",
    "aiSuggestedTarget": "Acme Corporation",
    "aiSuggestedTargetId": "990e8400-e29b-41d4-a716-446655440000"
  }'
```

```bash
curl -s -X PATCH "http://localhost:4000/api/agent/organization-ai-decisions/770e8400-e29b-41d4-a716-446655440000/execute" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "resolve",
    "reviewStatus": "manual"
  }'
```

**Response `200`:**

```json
{
  "success": true,
  "id": "770e8400-e29b-41d4-a716-446655440000",
  "reviewStatus": "approved",
  "organizationTmpId": null,
  "aliasResult": {
    "ok": true,
    "term": "Acme Ltd",
    "orgName": "Acme Corporation",
    "newAliases": ["Acme Ltd"]
  }
}
```

#### `operation: "approve"`

```bash
curl -s -X PATCH "http://localhost:4000/api/agent/organization-ai-decisions/770e8400-e29b-41d4-a716-446655440000/execute" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "approve",
    "status": "agent_approved"
  }'
```

**Response `200`:**

```json
{
  "id": "770e8400-e29b-41d4-a716-446655440000",
  "manualApprovalStatus": "agent_approved"
}
```

#### `operation: "comments"`

```bash
curl -s -X PATCH "http://localhost:4000/api/agent/organization-ai-decisions/770e8400-e29b-41d4-a716-446655440000/execute" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "comments",
    "comments": "Verified against LinkedIn"
  }'
```

**Response `200`:**

```json
{
  "id": "770e8400-e29b-41d4-a716-446655440000",
  "comments": "Verified against LinkedIn"
}
```

#### `operation: "fields"`

```bash
curl -s -X PATCH "http://localhost:4000/api/agent/organization-ai-decisions/770e8400-e29b-41d4-a716-446655440000/execute" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "fields",
    "agentNotes": "Staging data looks complete",
    "agentVerdict": "Ready for approval"
  }'
```

**Response `200`:**

```json
{
  "id": "770e8400-e29b-41d4-a716-446655440000",
  "comments": null,
  "agentNotes": "Staging data looks complete",
  "agentVerdict": "Ready for approval",
  "userVerdict": null
}
```

---

## Tag catalog (read) {#tag-catalog-read}

### GET `/api/agent/tags`

Scope: `agent:tags:read`

List catalog tags with pagination, free-text search, date filters, and optional type/status filters. Same underlying query as staff `GET /api/tags`, without embeddings.

**Query parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | number | `1` | Page number |
| `limit` | number | `25` | Page size (max `100`) |
| `search` | string | — | Free-text search on display names, tag key, category, synonyms, aliases |
| `q` | string | — | Alias for `search` |
| `id` | UUID | — | If set, returns only that tag (same shape as list, single row) |
| `type` | string | — | Single tag type, e.g. `skill`, `role` |
| `types` | string | — | Comma-separated types |
| `statuses` | string | — | Comma-separated statuses, e.g. `active,draft` |
| `sources` | string | — | Comma-separated sources |
| `dateFrom` | `YYYY-MM-DD` | — | Start of date range (inclusive) |
| `dateTo` | `YYYY-MM-DD` | — | End of date range (inclusive) |
| `fromDate` | `YYYY-MM-DD` | — | Alias for `dateFrom` |
| `toDate` | `YYYY-MM-DD` | — | Alias for `dateTo` |
| `from` | `YYYY-MM-DD` | — | Alias for `dateFrom` |
| `to` | `YYYY-MM-DD` | — | Alias for `dateTo` |
| `date` | `YYYY-MM-DD` | — | Single day (alternative to range) |
| `sort` | string | `tagKey` | Sort column |
| `direction` | `asc` \| `desc` | `asc` | Sort direction |

When `dateFrom`/`dateTo`/`date` is used, tags match if **either** `createdAt` or `updatedAt` falls in the range.

```bash
curl -s "http://localhost:4000/api/agent/tags?search=React&limit=10" \
  -H "Authorization: Bearer $TOKEN"
```

```bash
curl -s "http://localhost:4000/api/agent/tags?dateFrom=2026-09-01&dateTo=2026-09-17&type=skill" \
  -H "Authorization: Bearer $TOKEN"
```

**Response `200`:**

```json
{
  "data": [
    {
      "id": "uuid",
      "tagKey": "react",
      "displayNameHe": "React",
      "displayNameEn": "React",
      "type": "skill",
      "category": null,
      "status": "active",
      "source": "manual",
      "usageCount": 42,
      "aliases": ["React.js"],
      "synonyms": [],
      "createdAt": "2026-01-15T10:00:00.000Z",
      "updatedAt": "2026-09-10T08:00:00.000Z"
    }
  ],
  "total": 120,
  "page": 1,
  "limit": 10,
  "totalPages": 12
}
```

---

### GET `/api/agent/tags/:id`

Scope: `agent:tags:read`

Get a single catalog tag by UUID.

```bash
curl -s "http://localhost:4000/api/agent/tags/550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer $TOKEN"
```

**Response `200`:**

```json
{
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "tagKey": "react",
    "displayNameHe": "React",
    "displayNameEn": "React",
    "type": "skill",
    "status": "active",
    "aliases": ["React.js"],
    "synonyms": [
      {
        "id": "syn_1789549747785_0_e2o1s",
        "phrase": "ReactJS",
        "language": "en",
        "type": "synonym",
        "priority": 4
      }
    ],
    "createdAt": "2026-01-15T10:00:00.000Z",
    "updatedAt": "2026-09-10T08:00:00.000Z"
  }
}
```

**Synonym ids:** Each entry in `synonyms[]` has a stable `id` (e.g. `syn_1789549747785_0_e2o1s`). Use this id — not the phrase text — when calling `PATCH /api/agent/tags/:id/execute` with `remove_synonyms`.

**Tag aliases vs synonyms:** `aliases` is a plain string array (no ids). Synonym removal uses `synonyms[].id` only. Organization alias removal uses exact string match on `aliases[]`.

Errors: `400` invalid UUID; `404` tag not found.

---

## Organizations (read) {#organizations-read}

### GET `/api/agent/organizations`

Scope: `agent:organizations:read`

List live organizations with pagination, free-text search, and date filters. Same underlying query as staff `GET /api/organizations` (without embeddings/history).

**Query parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | number | `1` | Page number |
| `limit` | number | `25` | Page size (max `100`) |
| `search` | string | — | Free-text search on name, aliases, website, etc. |
| `q` | string | — | Alias for `search` |
| `id` | UUID | — | If set, returns only that organization (single row) |
| `mainField` | string | — | Filter by main field |
| `registrationNumber` | string | — | Exact match on ח.פ (9 digits) |
| `dataConfidence` | string | — | Exact match on data confidence |
| `activityStatus` | string | — | Exact match: `פעילה`, `לא פעילה`, `בפירוק`, `לא ידוע` |
| `location` | string | — | Filter by primary location (partial match) |
| `includeMerged` | boolean | `false` | Include merged organizations |
| `dateFrom` | `YYYY-MM-DD` | — | Start of date range (inclusive) |
| `dateTo` | `YYYY-MM-DD` | — | End of date range (inclusive) |
| `fromDate` | `YYYY-MM-DD` | — | Alias for `dateFrom` |
| `toDate` | `YYYY-MM-DD` | — | Alias for `dateTo` |
| `from` | `YYYY-MM-DD` | — | Alias for `dateFrom` |
| `to` | `YYYY-MM-DD` | — | Alias for `dateTo` |
| `date` | `YYYY-MM-DD` | — | Single day (alternative to range) |

When a date range is set, organizations match if **either** `createdAt` or `updatedAt` falls in the range.

```bash
curl -s "http://localhost:4000/api/agent/organizations?search=Acme&limit=20" \
  -H "Authorization: Bearer $TOKEN"
```

```bash
curl -s "http://localhost:4000/api/agent/organizations?fromDate=2026-09-01&toDate=2026-09-17&mainField=הייטק" \
  -H "Authorization: Bearer $TOKEN"
```

**Response `200`:**

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Acme Corporation",
      "nameEn": "Acme Corporation",
      "legalName": null,
      "aliases": ["Acme Ltd"],
      "mainField": "הייטק",
      "location": "תל אביב",
      "website": "https://acme.example",
      "candidateCount": 12,
      "activityStatus": "פעילה",
      "createdAt": "2025-06-01T08:00:00.000Z",
      "updatedAt": "2026-09-10T08:00:00.000Z"
    }
  ],
  "total": 85,
  "page": 1,
  "limit": 20,
  "totalPages": 5
}
```

---

### GET `/api/agent/organizations/:id`

Scope: `agent:organizations:read`

Get a single live organization by UUID (full API shape, excluding embeddings and history).

```bash
curl -s "http://localhost:4000/api/agent/organizations/990e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer $TOKEN"
```

**Response `200`:**

```json
{
  "data": {
    "id": "990e8400-e29b-41d4-a716-446655440000",
    "name": "Acme Corporation",
    "nameEn": "Acme Corporation",
    "aliases": [],
    "mainField": "הייטק",
    "website": "https://acme.example",
    "description": "...",
    "createdAt": "2025-06-01T08:00:00.000Z",
    "updatedAt": "2026-09-10T08:00:00.000Z"
  }
}
```

Errors: `400` invalid UUID; `404` organization not found.

---

## Organization enrichment & merge

### POST `/api/agent/organizations/:id/enrich`

Scope: `agent:organizations:write`

Runs Google AI company enrichment and writes verified fields directly to the live `Organization` record (no approval screen).

```bash
curl -s -X POST "http://localhost:4000/api/agent/organizations/{organizationId}/enrich" \
  -H "Authorization: Bearer $TOKEN"
```

**Response `200`:**

```json
{
  "data": {
    "organizationId": "uuid",
    "enriched": true,
    "updatedFields": ["website", "employeeCount", "description"],
    "organization": { "...": "..." }
  }
}
```

---

### POST `/api/agent/organizations/merge`

Scope: `agent:organizations:write`

Merge a source organization into a target (general merge, not tied to a pending decision queue). Same underlying logic as staff `POST /api/organizations/merge`, wrapped with agent audit logging.

| Field | Required | Description |
|-------|----------|-------------|
| `sourceId` | yes* | UUID of organization to merge away |
| `targetId` | yes* | UUID of surviving organization |
| `sourceOrganizationId` | yes* | Alias for `sourceId` |
| `targetOrganizationId` | yes* | Alias for `targetId` |

\* Provide one name pair (`sourceId` + `targetId`, or `sourceOrganizationId` + `targetOrganizationId`).

```bash
curl -s -X POST "http://localhost:4000/api/agent/organizations/merge" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sourceId": "source-org-uuid",
    "targetId": "target-org-uuid"
  }'
```

**Response `200`:**

```json
{
  "data": {
    "targetOrganizationId": "target-org-uuid",
    "sourceOrganizationId": "source-org-uuid",
    "result": { "...": "merge service payload" },
    "organization": { "...": "updated target organization" }
  }
}
```

Errors: `400` if source and target are the same or UUIDs invalid; `404` if either organization not found.

---

### PATCH `/api/agent/organizations/:id/execute` {#patch-apiagentorganizationsidexecute}

Scope: `agent:organizations:write`

Execute live organization maintenance operations. Audit logged per agent actor (`metadata.operation`, `metadata.addedAliases` / `metadata.removedAliases`).

#### `operation: "add_aliases"`

Add aliases to a live organization without merging. Duplicate normalized phrases (trim + lowercase) against `name`, `nameEn`, `legalName`, and existing `aliases` are skipped — the response includes `skippedDuplicates` with the existing alias text instead of creating a second entry.

| Field | Required | Description |
|-------|----------|-------------|
| `operation` | yes | `"add_aliases"` |
| `aliases` | yes | Non-empty array of alias strings to add |

```bash
curl -s -X PATCH "http://localhost:4000/api/agent/organizations/990e8400-e29b-41d4-a716-446655440000/execute" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "add_aliases",
    "aliases": ["Acme Ltd", "Acme Limited"]
  }'
```

**Response `200`:**

```json
{
  "operation": "add_aliases",
  "addedAliases": ["Acme Ltd", "Acme Limited"],
  "skippedDuplicates": [],
  "aliases": ["Acme Ltd", "Acme Limited"],
  "data": {
    "id": "990e8400-e29b-41d4-a716-446655440000",
    "name": "Acme Corporation",
    "aliases": ["Acme Ltd", "Acme Limited"]
  }
}
```

When every requested alias is already present (normalized), `addedAliases` is empty and no audit row is written.

#### `operation: "remove_aliases"`

Remove aliases from a live organization by **exact string match** (trimmed). Organization `aliases` is a plain string array — match by text, not id.

| Field | Required | Description |
|-------|----------|-------------|
| `operation` | yes | `"remove_aliases"` |
| `aliases` | yes | Non-empty array of alias strings to remove exactly |

```bash
curl -s -X PATCH "http://localhost:4000/api/agent/organizations/990e8400-e29b-41d4-a716-446655440000/execute" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "remove_aliases",
    "aliases": ["Acme Ltd"]
  }'
```

**Response `200`:**

```json
{
  "operation": "remove_aliases",
  "removedAliases": ["Acme Ltd"],
  "data": {
    "id": "990e8400-e29b-41d4-a716-446655440000",
    "name": "Acme Corporation",
    "aliases": []
  }
}
```

Errors: `400` if body invalid; `404` with `code: "ALIAS_NOT_FOUND"` if any alias string is not present on the organization.

#### `operation: "update_fields"`

Partial update of any writable organization profile field. Send only fields that change. **`null` clears a value** (e.g. wrong ח.פ, website, logo).

| Field | Required | Description |
|-------|----------|-------------|
| `operation` | yes | `"update_fields"` |
| `fields` | yes | Object with one or more writable fields |
| `expectedUpdatedAt` | recommended | ISO timestamp from last `GET`; mismatch → `409 OPTIMISTIC_LOCK` |

Writable fields include: `name`, `nameEn`, `legalName`, `registrationNumber`, `activityStatus`, `dataConfidence`, `lastVerified`, `location`, `address`, `hqCountry`, `website`, `linkedinUrl`, `email`, `phone`, `logo`, `foundedYear`, `employeeCount`, industry/structure fields, `tags`, `techTags`, `description`, `comments`, `additionalLocations` (full replace).

**Restrictions:**
- `dataConfidence`: agent may set only `Verified by Agent`, `Missing`, `Pending Review` (Hebrew aliases accepted). `Verified by User` → **`403 FORBIDDEN_DATA_CONFIDENCE`**.
- `registrationNumber`: exactly 9 digits, or `null`.
- `activityStatus`: `פעילה` \| `לא פעילה` \| `בפירוק` \| `לא ידוע` (not `merged`).
- `location` / additional-location cities: validated against cities catalog.
- Read-only: `id`, `createdAt`, `updatedAt`, `dataCompleteness`, `candidateCount`, `snippet`, `aliases`.

```bash
curl -s -X PATCH "$BASE/api/agent/organizations/{id}/execute" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "update_fields",
    "expectedUpdatedAt": "2026-09-29T10:00:00.000Z",
    "fields": {
      "registrationNumber": null,
      "activityStatus": "לא פעילה",
      "dataConfidence": "Verified by Agent",
      "comments": "ח.פ שגוי — נוקה על ידי סוכן"
    }
  }'
```

**Response `200`:** `{ "operation": "update_fields", "updatedFields": [...], "data": { ...full org... } }`

Audit: agent entity audit with `metadata.operation: "update_fields"` and per-field before/after in `changes`.

#### Additional location operations

| Operation | Body |
|-----------|------|
| `add_additional_location` | `description`, `location` (city), optional `address`, `sortIndex`, `expectedUpdatedAt` |
| `update_additional_location` | `locationId`, any of `description`, `location`, `address`, `sortIndex`, `expectedUpdatedAt` |
| `remove_additional_location` | `locationId`, `expectedUpdatedAt` |

---

### POST `/api/agent/organizations`

Scope: `agent:organizations:write`

Create a live organization directly (e.g. split a real company out of a generic bucket). Same field validation as `update_fields`. **`name` is required.**

Duplicate check by ח.פ and normalized name → **`409 DUPLICATE_ORGANIZATION`** with `existingOrganization`.

```bash
curl -s -X POST "$BASE/api/agent/organizations" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fields": {
      "name": "ישרוטל",
      "registrationNumber": "512491846",
      "activityStatus": "פעילה"
    }
  }'
```

---

### GET `/api/agent/organizations/duplicates`

Scope: `agent:organizations:read`

Returns groups of live organizations sharing the same **registration number** or **normalized name**.

Query: `limit` (default 50, max 200).

---

### Organization AI decisions — `organizationId`

`GET /api/agent/organization-ai-decisions` and `GET .../:id` now include read-only **`organizationId`**: the live `Organization` created or linked for that decision (backfilled from `originalTerm` when missing).

**Closing `create_company` without re-creating:** use `PATCH .../execute` with `operation: "resolve"`, `reviewStatus: "approved"`. The company already exists from the pipeline; resolve links `organizationId` and sets `reviewStatus` — **no duplicate org**. `approve` with `agent_approved` only updates `manualApprovalStatus`; use `resolve` to close review status.

---

## Tag catalog (write)

### POST `/api/agent/tags/merge` {#post-apiagenttagsmerge}

Scope: `agent:tags:write`

Merge one or more source catalog tags into target tags. Same body and behavior as staff `POST /api/tags/merge`, with agent audit logging per merge.

| Field | Required | Description |
|-------|----------|-------------|
| `merges` | yes | Non-empty array of merge operations |
| `merges[].sourceTagId` | yes | UUID of tag to merge away |
| `merges[].targetTagId` | yes | UUID of surviving catalog tag |
| `merges[].aliasPriority` | no | Alias priority `1`–`5` (default `4`) |

```bash
curl -s -X POST "http://localhost:4000/api/agent/tags/merge" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "merges": [
      {
        "sourceTagId": "aa0e8400-e29b-41d4-a716-446655440000",
        "targetTagId": "bb0e8400-e29b-41d4-a716-446655440001",
        "aliasPriority": 4
      }
    ]
  }'
```

**Response `200`:**

```json
{
  "success": true,
  "results": [
    {
      "sourceTagId": "aa0e8400-e29b-41d4-a716-446655440000",
      "targetTagId": "bb0e8400-e29b-41d4-a716-446655440001",
      "mergedTerms": ["React", "React.js"]
    }
  ]
}
```

Errors: `400` if `merges` is empty, UUIDs invalid, or source equals target; `404` if source or target tag not found.

---

### POST `/api/agent/tags/:id/enrich` {#post-apiagenttagsidenrich}

Scope: `agent:tags:write`

Run **deep AI enrichment** on a single catalog tag using the same pipeline as the admin UI “העשרה עמוקה” button: loads the full tag record from the database and passes it to `tag_ai_enriched` (not bare tag names — avoids mismatched suggestions).

Persists the enrichment like applying AI suggestions in the UI:

- `status` → `draft`
- `qualityState` → `needs_review`
- `source` → `ai`
- May update `tagKey`, `category`, `synonyms`, display names, `type`, `descriptionHe`, `domains`

Audit logged with `metadata.operation: "enrich"` and `before` / `after` snapshots.

```bash
curl -s -X POST "http://localhost:4000/api/agent/tags/1731549b-dac2-4f6b-ad54-fd28f164cc9c/enrich" \
  -H "Authorization: Bearer $TOKEN"
```

**Response `200`:**

```json
{
  "data": {
    "tagId": "1731549b-dac2-4f6b-ad54-fd28f164cc9c",
    "enriched": true,
    "before": {
      "tagKey": "react",
      "category": "Software",
      "synonyms": []
    },
    "after": {
      "tagKey": "react_js",
      "category": "Software Development",
      "synonyms": [
        {
          "id": "syn_1789549747785_0_e2o1s",
          "phrase": "React.js",
          "language": "en",
          "type": "alias",
          "priority": 4
        }
      ]
    },
    "data": { "...": "full tag DTO from GET /api/agent/tags/:id" }
  }
}
```

Errors: `404` tag not found; `502` if AI returns no parseable suggestion; `400` on unique constraint if suggested `tagKey` collides with another tag.

---

### PATCH `/api/agent/tags/:id/execute` {#patch-apiagenttagsidexecute}

Scope: `agent:tags:write`

Execute catalog tag maintenance operations. Audit logged per agent actor (`metadata.operation`, `metadata.addedSynonyms` / `metadata.removedSynonymIds`).

**Tag `source` field:** Both `add_synonyms` and `remove_synonyms` persist changes through the catalog tag update path, which sets `source` to `"manual"` when the agent modifies synonyms. This matches staff manual curation and is consistent across add and remove.

**Supported operations:**

| `operation` | Description |
|-------------|-------------|
| `add_synonyms` | Add synonyms/aliases by phrase (returns stable `synonyms[].id` for new entries) |
| `remove_synonyms` | Remove synonyms by stable `synonyms[].id` from `GET /api/agent/tags/:id` |
| `update_status` | Set `status` (`active` \| `draft`) and/or `qualityState` (`verified` \| `needs_review`) |

#### `operation: "add_synonyms"`

Add one or more synonyms to a catalog tag without merging. Duplicate normalized phrases (trim + lowercase) are skipped — the response includes `skippedDuplicates` with the existing stable `existingSynonymId` instead of creating a second entry.

| Field | Required | Description |
|-------|----------|-------------|
| `operation` | yes | `"add_synonyms"` |
| `synonyms` | yes | Non-empty array of synonym objects |
| `synonyms[].phrase` | yes | Synonym text |
| `synonyms[].language` | yes | `"he"` or `"en"` |
| `synonyms[].type` | yes | `"synonym"` or `"alias"` |
| `synonyms[].priority` | yes | Integer `1`–`5` (5 = highest match weight) |

```bash
curl -s -X PATCH "http://localhost:4000/api/agent/tags/1731549b-dac2-4f6b-ad54-fd28f164cc9c/execute" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "add_synonyms",
    "synonyms": [
      {
        "phrase": "React.js",
        "language": "en",
        "type": "alias",
        "priority": 4
      }
    ]
  }'
```

**Response `200`:**

```json
{
  "operation": "add_synonyms",
  "addedSynonyms": [
    {
      "id": "syn_1789549747785_0_e2o1s",
      "phrase": "React.js",
      "language": "en",
      "type": "alias",
      "priority": 4
    }
  ],
  "skippedDuplicates": [],
  "data": {
    "id": "1731549b-dac2-4f6b-ad54-fd28f164cc9c",
    "tagKey": "react",
    "synonyms": [
      {
        "id": "syn_1789549747785_0_e2o1s",
        "phrase": "React.js",
        "language": "en",
        "type": "alias",
        "priority": 4
      }
    ]
  }
}
```

When every requested phrase already exists (normalized), `addedSynonyms` is empty and no audit row is written; `data` still returns the current tag.

#### `operation: "update_status"`

Update catalog tag lifecycle fields without running AI enrichment.

| Field | Required | Description |
|-------|----------|-------------|
| `operation` | yes | `"update_status"` |
| `status` | no* | `"active"` or `"draft"` |
| `qualityState` | no* | `"verified"` or `"needs_review"` |

\* At least one of `status` or `qualityState` must be provided.

```bash
curl -s -X PATCH "http://localhost:4000/api/agent/tags/1731549b-dac2-4f6b-ad54-fd28f164cc9c/execute" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "update_status",
    "status": "active",
    "qualityState": "verified"
  }'
```

**Response `200`:**

```json
{
  "operation": "update_status",
  "status": "active",
  "qualityState": "verified",
  "data": {
    "id": "1731549b-dac2-4f6b-ad54-fd28f164cc9c",
    "tagKey": "react",
    "status": "active",
    "qualityState": "verified"
  }
}
```

#### `operation: "remove_synonyms"`

Remove one or more synonyms from a catalog tag by **stable synonym id** (from `GET /api/agent/tags/:id` → `synonyms[].id`). Do not match by phrase text.

| Field | Required | Description |
|-------|----------|-------------|
| `operation` | yes | `"remove_synonyms"` |
| `synonymIds` | yes | Non-empty array of synonym ids, e.g. `"syn_1789549747785_0_e2o1s"` |

```bash
curl -s -X PATCH "http://localhost:4000/api/agent/tags/1731549b-dac2-4f6b-ad54-fd28f164cc9c/execute" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "remove_synonyms",
    "synonymIds": ["syn_1789549747785_0_e2o1s"]
  }'
```

**Response `200`:**

```json
{
  "operation": "remove_synonyms",
  "removedSynonymIds": ["syn_1789549747785_0_e2o1s"],
  "data": {
    "id": "1731549b-dac2-4f6b-ad54-fd28f164cc9c",
    "tagKey": "bi",
    "synonyms": []
  }
}
```

Errors: `400` if body invalid; `404` with `code: "SYNONYM_NOT_FOUND"` if any synonym id is missing on the tag.

---

## Staging company write

### PATCH `/api/agent/organization-ai-decisions/:id/staging-company`

Scope: `agent:organization-ai-decisions:write`

Write staging company fields on the linked `OrganizationTmp` row. Supports optimistic locking via `expectedUpdatedAt` (the decision row’s `updatedAt` from GET).

**Writable fields:** identity (`name`, `nameEn`, `legalName`, `aliases`, `website`, `linkedinUrl`), business profile, org structure, scale, addresses (`location`, `hqCountry`), tech/tags/description.

```bash
curl -s -X PATCH "http://localhost:4000/api/agent/organization-ai-decisions/{id}/staging-company" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "expectedUpdatedAt": "2026-09-14T10:00:00.000Z",
    "name": "Acme Ltd",
    "employeeCount": "(Growth) 51-200",
    "description": "Cloud SaaS platform"
  }'
```

---

## Optimistic locking

All decision PATCH endpoints accept optional `expectedUpdatedAt` (or `updatedAt`). If the row changed since the agent last read it, the API returns **`409`** with `code: "OPTIMISTIC_LOCK"`.

```json
{
  "message": "Row was modified since last read — refresh and retry",
  "code": "OPTIMISTIC_LOCK"
}
```

List/get responses now include `updatedAt` on decisions.

---

## Agent audit logs

### GET `/api/agent/audit-logs`

Scope: `agent:audit-logs:read`

Structured audit trail for agent actions (writes, enrich, merge, decision changes).

| Param | Description |
|-------|-------------|
| `page`, `pageSize` | Pagination |
| `entityType` | e.g. `Organization`, `OrganizationTmp`, `Tag`, `TagAiDecision`, `OrganizationAiDecision`, `ClientOrganizationLink`, `ClientContact` |
| `entityId` | Filter by entity UUID |
| `batchId` | Match inside metadata |
| `from`, `to` | Date range |
| `search` | Free text |

Staff UI: **יומן אירועים** (`AdminEventsView`) supports filter **«סוכן AI בלבד»** via `GET /api/audit-logs?actor=agent`.

Each log row includes: `entityType`, `entityId`, `entityName`, `userName` (סוכן AI (Hiro)), `timestamp`, `changes[]` (before/after per field), `metadata` (`source: agent_api`, `operation`, etc.).

---

## Client CRM (links & contacts)

Tenant client helpers for linking catalog organizations and managing CRM contacts. Agents **cannot** call staff `/api/clients/*` — use the equivalents below.

| Staff route | Agent route |
|-------------|-------------|
| `POST /api/clients/:clientId/organization-link` | `POST /api/agent/clients/:clientId/organization-link` |
| `GET /api/clients/:clientId/contacts` | `GET /api/agent/clients/:clientId/contacts` |
| `POST /api/clients/:clientId/contacts` | `POST /api/agent/clients/:clientId/contacts` |
| `PUT /api/clients/:clientId/contacts/:contactId` | `PATCH /api/agent/clients/:clientId/contacts/:contactId` |
| `DELETE /api/clients/:clientId/contacts/:contactId` | `DELETE /api/agent/clients/:clientId/contacts/:contactId` |

All `:clientId`, `:organizationId`, and `:contactId` path/query values must be valid UUIDs.

Writes are audit-logged (`entityType`: `ClientOrganizationLink`, `ClientContact`; `metadata.clientId` / `metadata.organizationId`).

---

### POST `/api/agent/clients/:clientId/organization-link`

Scope: `agent:clients:write`

Link an **existing** catalog organization to a tenant client (same as staff UI «קשר לארגון»). One organization per request — **no batch**.

| Field | Required | Description |
|-------|----------|-------------|
| `organizationId` | yes | UUID of live `Organization` from catalog (`GET /api/agent/organizations`) |

```bash
curl -s -X POST "http://localhost:4000/api/agent/clients/550e8400-e29b-41d4-a716-446655440000/organization-link" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "organizationId": "990e8400-e29b-41d4-a716-446655440000" }'
```

**Response `200`:** Updated client JSON (includes `organizationLinks` array with linked org / tmp rows).

Errors: `400` if `organizationId` missing or invalid UUID; `404` if client or organization not found.

---

### GET `/api/agent/clients/:clientId/contacts`

Scope: `agent:clients:read`

Returns a **plain JSON array** (not wrapped in `{ data: [...] }`).

| Query | Required | Description |
|-------|----------|-------------|
| `organizationId` | no | Filter to contacts scoped to one linked organization |

```bash
# All contacts for client
curl -s "http://localhost:4000/api/agent/clients/550e8400-e29b-41d4-a716-446655440000/contacts" \
  -H "Authorization: Bearer $TOKEN"

# Contacts for one organization
curl -s "http://localhost:4000/api/agent/clients/550e8400-e29b-41d4-a716-446655440000/contacts?organizationId=990e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer $TOKEN"
```

**Response `200`:**

```json
[
  {
    "id": "aa0e8400-e29b-41d4-a716-446655440001",
    "name": "דנה כהן",
    "email": "dana@example.com",
    "role": "HR",
    "mobilePhone": "050-1234567",
    "phone": "03-1234567",
    "linkedin": "https://linkedin.com/in/dana",
    "organizationId": "990e8400-e29b-41d4-a716-446655440000",
    "createdAt": "2026-04-05T09:36:00.000Z"
  }
]
```

**Read shape (each item):**

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Contact primary key |
| `name` | string | Combined `firstName` + `lastName` on read |
| `email` | string | Primary email |
| `role` | string | Job title / role |
| `mobilePhone` | string | Mobile |
| `phone` | string | Office / landline |
| `linkedin` | string | Profile URL |
| `organizationId` | UUID \| null | Linked org when scoped |
| `createdAt` | ISO timestamp | Row creation time |

Errors: `400` if `organizationId` query is not a valid UUID; `404` if client not found.

---

### POST `/api/agent/clients/:clientId/contacts`

Scope: `agent:clients:write`

Create a CRM contact under a client. **Write** uses split `firstName` / `lastName`; **read** returns unified `name`.

| Field | Required | Description |
|-------|----------|-------------|
| `organizationId` | yes | UUID — contact belongs to this linked org |
| `firstName` | yes | Given name |
| `lastName` | no | Family name |
| `role` | no | Job title |
| `email` | no | Primary email |
| `mobilePhone` | no | Mobile number |
| `phone` | no | Office number |
| `linkedin` | no | LinkedIn URL |
| `distributionEmail` | no | Boolean — include in email distributions (default `true`) |
| `distributionSms` | no | Boolean — include in SMS distributions (default `true`) |
| `distributionWhatsapp` | no | Boolean — include in WhatsApp distributions (default `true`) |

```bash
curl -s -X POST "http://localhost:4000/api/agent/clients/550e8400-e29b-41d4-a716-446655440000/contacts" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "organizationId": "990e8400-e29b-41d4-a716-446655440000",
    "firstName": "דנה",
    "lastName": "כהן",
    "role": "HR",
    "email": "dana@example.com",
    "mobilePhone": "050-1234567",
    "phone": "03-1234567",
    "distributionEmail": true,
    "distributionSms": true,
    "distributionWhatsapp": false
  }'
```

**Response `201`:** Created contact (same read shape as GET list item).

Errors: `400` if `organizationId` or `firstName` missing, or UUIDs invalid; `404` if client not found.

---

### PATCH `/api/agent/clients/:clientId/contacts/:contactId`

Scope: `agent:clients:write`

Update an existing CRM contact. Send only fields to change. **Write** uses split `firstName` / `lastName`; **read** returns unified `name`.

| Field | Required | Description |
|-------|----------|-------------|
| `organizationId` | no | Move contact to another linked org |
| `firstName` | no | Given name |
| `lastName` | no | Family name |
| `role` | no | Job title |
| `email` | no | Primary email |
| `mobilePhone` | no | Mobile number |
| `phone` | no | Office number |
| `linkedin` | no | LinkedIn URL |
| `distributionEmail` | no | Boolean — include in email distributions |
| `distributionSms` | no | Boolean — include in SMS distributions |
| `distributionWhatsapp` | no | Boolean — include in WhatsApp distributions |

```bash
curl -s -X PATCH "http://localhost:4000/api/agent/clients/550e8400-e29b-41d4-a716-446655440000/contacts/aa0e8400-e29b-41d4-a716-446655440001" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "role": "VP HR",
    "email": "dana.new@example.com",
    "mobilePhone": "050-9999999",
    "distributionWhatsapp": true
  }'
```

**Response `200`:** Updated contact (same read shape as GET list item).

Errors: `400` if body is empty or UUIDs invalid; `404` if client or contact not found, or contact belongs to another client.

---

### DELETE `/api/agent/clients/:clientId/contacts/:contactId`

Scope: `agent:clients:write`

Delete a contact. The contact must belong to `:clientId`.

```bash
curl -s -X DELETE "http://localhost:4000/api/agent/clients/550e8400-e29b-41d4-a716-446655440000/contacts/aa0e8400-e29b-41d4-a716-446655440001" \
  -H "Authorization: Bearer $TOKEN" \
  -w "\nHTTP %{http_code}\n"
```

**Response `204`:** Empty body.

Errors: `400` if UUIDs invalid; `404` if client or contact not found, or contact belongs to another client.

---

## Endpoint summary

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| POST | `/api/agent/auth/login` | — | Agent login |
| GET | `/api/agent/health` | `agent:ping` | Health check |
| GET | `/api/agent/me` | `agent:ping` | Agent identity |
| GET | `/api/agent/capabilities` | `agent:ping` | Capability matrix (available / unavailable) |
| GET | `/api/agent/tag-ai-decisions` | `agent:tag-ai-decisions:read` | List tag decisions |
| GET | `/api/agent/tag-ai-decisions/:id` | `agent:tag-ai-decisions:read` | Get tag decision (+ retrieval snapshot) |
| GET | `/api/agent/tag-ai-decisions/:id/candidates` | `agent:tag-ai-decisions:read` | Retrieval candidates only |
| PATCH | `/api/agent/tag-ai-decisions/:id` | `agent:tag-ai-decisions:write` | Update agent notes/verdict (+ lock) |
| PATCH | `/api/agent/tag-ai-decisions/:id/execute` | `agent:tag-ai-decisions:write` | Execute tag review action |
| GET | `/api/agent/organization-ai-decisions` | `agent:organization-ai-decisions:read` | List org decisions |
| GET | `/api/agent/organization-ai-decisions/:id` | `agent:organization-ai-decisions:read` | Get org decision + staging company |
| PATCH | `/api/agent/organization-ai-decisions/:id` | `agent:organization-ai-decisions:write` | Update agent notes/verdict (+ lock) |
| PATCH | `/api/agent/organization-ai-decisions/:id/execute` | `agent:organization-ai-decisions:write` | Execute org review action |
| PATCH | `/api/agent/organization-ai-decisions/:id/staging-company` | `agent:organization-ai-decisions:write` | Write staging company fields |
| GET | `/api/agent/tags` | `agent:tags:read` | List catalog tags |
| GET | `/api/agent/tags/:id` | `agent:tags:read` | Get catalog tag |
| POST | `/api/agent/tags/merge` | `agent:tags:write` | Merge catalog tags |
| POST | `/api/agent/tags/:id/enrich` | `agent:tags:write` | Deep AI enrich (full tag context) |
| PATCH | `/api/agent/tags/:id/execute` | `agent:tags:write` | Tag maintenance (`add_synonyms`, `remove_synonyms`, `update_status`) |
| GET | `/api/agent/organizations` | `agent:organizations:read` | List live organizations (filters: `registrationNumber`, `dataConfidence`, `activityStatus`) |
| GET | `/api/agent/organizations/duplicates` | `agent:organizations:read` | Duplicate org groups (same ח.פ or normalized name) |
| POST | `/api/agent/organizations` | `agent:organizations:write` | Create live organization |
| GET | `/api/agent/organizations/:id` | `agent:organizations:read` | Get live organization |
| PATCH | `/api/agent/organizations/:id/execute` | `agent:organizations:write` | Org maintenance (`update_fields`, aliases, additional locations) |
| POST | `/api/agent/organizations/:id/enrich` | `agent:organizations:write` | AI enrich → live org |
| POST | `/api/agent/organizations/merge` | `agent:organizations:write` | Merge two organizations |
| POST | `/api/agent/clients/:clientId/organization-link` | `agent:clients:write` | Link catalog org to client |
| GET | `/api/agent/clients/:clientId/contacts` | `agent:clients:read` | List client contacts |
| POST | `/api/agent/clients/:clientId/contacts` | `agent:clients:write` | Create client contact |
| PATCH | `/api/agent/clients/:clientId/contacts/:contactId` | `agent:clients:write` | Update client contact |
| DELETE | `/api/agent/clients/:clientId/contacts/:contactId` | `agent:clients:write` | Delete client contact |
| GET | `/api/agent/audit-logs` | `agent:audit-logs:read` | Query agent audit trail |

---

## Fields hidden from agents (read DTO)

| Hidden field | Applies to |
|--------------|------------|
| `candidateId`, `candidateName` | Organization decisions |
| `comments`, `userVerdict` | Both (in list/get; writable via `/execute`) |
| `reviewerAction`, `resolvedAt`, `resolvedTargetTagId` | Both |
| `pendingTagId` | Tag decisions |
| `organizationTmpId`, `aiSuggestedTargetId` | Organization decisions (use read-only `organizationId` for live org link) |
| Live `Organization` record | Organization **AI decisions** list/get (use `GET /api/agent/organizations` for live orgs) |

**Now exposed (tag decisions):** `candidateTagsSnapshot`, `candidateCount`, `retrieval` — see [Retrieval diagnostics](#retrieval-diagnostics).

---

## Error responses

| Status | Meaning |
|--------|---------|
| `400` | Invalid body, unknown fields, invalid UUID, missing required param |
| `401` | Missing/invalid token, bad login |
| `403` | Insufficient scope, or agent token used on staff API |
| `404` | Resource not found (decision, tag, org, synonym id, alias string, or unknown route) |
| `409` | Optimistic lock conflict (`OPTIMISTIC_LOCK`) |

**Common error codes (`code` field):**

| Code | When |
|------|------|
| `OPTIMISTIC_LOCK` | Decision row changed since `expectedUpdatedAt` |
| `SYNONYM_NOT_FOUND` | One or more `synonymIds` not on the tag (`PATCH .../tags/:id/execute`) |
| `ALIAS_NOT_FOUND` | One or more alias strings not on the organization (`PATCH .../organizations/:id/execute`) |
| `TAG_PROTECTED` | Catalog tag is in **תגיות מוגנות** — block merge-as-source, delete, status change, deep enrich; skip and do not retry. Merging *into* a protected tag (aliases only) is allowed. |

```json
{ "message": "Synonym id(s) not found on tag: syn_missing_id", "code": "SYNONYM_NOT_FOUND" }
```

---

## Security model

1. **Separate login** — `/api/agent/auth/login`, not staff `/api/auth/login`.
2. **Separate JWT** — signed with `AGENT_JWT_SECRET`, payload includes `"typ": "agent"`.
3. **Token isolation**
   - Agent tokens rejected on staff routes → `403 Agent token cannot access this API`
   - Staff tokens rejected on agent routes → `401 Invalid agent token`
4. **Route isolation** — only `agentController` handlers under `/api/agent`.
5. **Scope enforcement** — each route checks required scope.
6. **DTO allowlists** — reads use explicit column lists; simple PATCH whitelists two fields.
7. **Audit trail** — agent API calls and decision changes are logged with agent actor.

---

## What agents cannot do

- Access `/api/candidates`, `/api/clients`, `/api/jobs`, `/api/users`, or other staff routes (including staff `/api/tags/*`, `/api/organizations/*`, and `/api/clients/:clientId/*` — use the agent equivalents under `/api/agent/*` instead; see [Client CRM](#client-crm-links--contacts)).
- Use staff login or obtain a staff JWT.
- Read live `Organization` records via staff `/api/organizations/*` (use `GET /api/agent/organizations` instead).
- Call staff AI decision endpoints with an agent token.

---

## Changelog

### 2026-10-06

- **Protected catalog tags (`isProtected`)** — staff: `POST /api/tags/protect` / `unprotect` (admin). Agents receive `403` + `TAG_PROTECTED` when a blocked mutation targets a protected tag; use `PATCH .../execute` `add_synonyms` only, or merge other tags *into* the protected target.

### 2026-09-29

- **`PATCH /api/agent/organizations/:id/execute`** — `update_fields` (partial profile edit, null clears values, optimistic lock)
- **Additional location ops** — `add_additional_location`, `update_additional_location`, `remove_additional_location`
- **`POST /api/agent/organizations`** — create live organization with duplicate detection (`409 DUPLICATE_ORGANIZATION`)
- **`GET /api/agent/organizations/duplicates`** — groups by shared ח.פ or normalized name
- **List filters** — `registrationNumber`, `dataConfidence`, `activityStatus` on `GET /api/agent/organizations`
- **Organization AI decisions** — read-only `organizationId`; `resolve` on `create_company` closes without re-creating org
- **Pipeline dedup** — advisory lock on concurrent `create_company` in `findOrCreateByName`
- **`GET /api/agent/capabilities`** — organization + org-decision capability entries added

### 2026-09-23

- **Client CRM** — link org + list/create/delete contacts under `/api/agent/clients/:clientId/*` (scopes `agent:clients:read` / `agent:clients:write`); staff route mapping documented in [Client CRM](#client-crm-links--contacts)
- **`PATCH /api/agent/tags/:id/execute`** — `add_synonyms` with duplicate phrase detection (`skippedDuplicates` + stable ids)
- **`PATCH /api/agent/organizations/:id/execute`** — `add_aliases` with normalized duplicate detection
- **Retrieval diagnostics** — `tagKey` added to candidate objects (new snapshots); `candidateTagsSnapshot`, `retrieval.k`, and `GET .../tag-ai-decisions/:id/candidates` for pgvector debugging
- Agent tag synonym add/remove both set catalog tag `source` to `"manual"` (consistent curation semantics)

### 2026-09-22

- **`PATCH /api/agent/tags/:id/execute`** — `remove_synonyms` by stable `synonyms[].id`
- **`PATCH /api/agent/organizations/:id/execute`** — `remove_aliases` by exact alias string
- **Retrieval diagnostics** — `candidateTagsSnapshot`, `retrieval`, and `GET .../tag-ai-decisions/:id/candidates` exposed for pgvector debugging
- Agent audit logs record `remove_synonyms` / `remove_aliases` with `metadata.operation`
