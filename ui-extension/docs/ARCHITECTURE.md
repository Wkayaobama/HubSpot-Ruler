# IcAlps CRM Card — Architecture

Reference for the patterns this app uses. Skim before extending, adding a card, or replicating to prod.

---

## 1. What this app does

Private HubSpot app on developer platform **2026.03**. Installed on both sandbox `49610528` (appId `37141512`) and prod `9201667` / wisekeysa (appId `37414115`, cutover 2026-04-22). Five cards + four serverless functions + three IcAlps property registries (Deal / Contact / Company).

| Card | On record | Action |
|---|---|---|
| `icalps_deal_card` | Deal | Open an overlay Panel to **edit** every non-calculated IcAlps Deal property in one submit. |
| `icalps_new_deal_card_contact` | Contact | Open a Panel to **create** a new IcAlps deal, auto-associated to the originating Contact. |
| `icalps_new_deal_card_company` | Company | Same, auto-associated to the Company. |
| `icalps_new_contact_card_company` | Company | Open a Panel to **create** a new Contact (email required), auto-associated to the Company. |
| `icalps_new_company_card_contact` | Contact | Open a Panel to **create** a new Company (name required), auto-associated to the Contact. |

Server-side writes:
- `update_deal_properties` — PATCH `/crm/v3/objects/deals/{id}`.
- `create_icalps_deal` — POST `/crm/v3/objects/deals` with forced pipeline + stage and optional association.
- `create_icalps_contact` — POST `/crm/v3/objects/contacts` with optional association.
- `create_icalps_company` — POST `/crm/v3/objects/companies` with optional association.

Property registries:
- `icalpsPropertyConfig.ts` — Deal (Status / Identity / Timeline / Calculated groups).
- `contactIcalpsPropertyConfig.ts` — Contact (Channels / Identity / Language / Location).
- `companyIcalpsPropertyConfig.ts` — Company (Identity / Contact info / Classification / Address).

All four Create/Edit panels iterate their registry via `FieldRenderer`. Adding a property to a form is a one-line change in the relevant config file; flipping `required: true` wires it into the panel's validation.

---

## 2. Component graph

```
src/app/
├── app-hsmeta.json                                  (app manifest, scopes, permittedUrls)
├── cards/
│   ├── card-hsmeta.json                             → IcAlpsCard.tsx             (Deal: edit)
│   ├── new-icalps-deal-contact-hsmeta.json          → NewIcAlpsDealCard.tsx      (Contact: create deal)
│   ├── new-icalps-deal-company-hsmeta.json          → NewIcAlpsDealCard.tsx      (Company: create deal)
│   ├── new-icalps-contact-from-company-hsmeta.json  → NewIcAlpsContactCard.tsx   (Company: create contact)
│   ├── new-icalps-company-from-contact-hsmeta.json  → NewIcAlpsCompanyCard.tsx   (Contact: create company)
│   ├── IcAlpsCard.tsx           → EditStatusPanel     → hubspot.serverless('update_deal_properties')
│   ├── NewIcAlpsDealCard.tsx    → NewIcAlpsDealPanel  → hubspot.serverless('create_icalps_deal')
│   ├── NewIcAlpsContactCard.tsx → NewIcAlpsContactPanel → hubspot.serverless('create_icalps_contact')
│   ├── NewIcAlpsCompanyCard.tsx → NewIcAlpsCompanyPanel → hubspot.serverless('create_icalps_company')
│   ├── FieldRenderer.tsx                            (shared input-type switch)
│   ├── icalpsPropertyConfig.ts                      (grouped Deal property registry + editable flags)
│   └── utils/
│       └── propertyValue.ts                         (serializeForWrite, changed, BaseDate)
└── functions/
    ├── update-deal-function-hsmeta.json             → updateDealProperties.js
    ├── create-deal-function-hsmeta.json             → createIcAlpsDeal.js
    ├── create-contact-function-hsmeta.json          → createIcAlpsContact.js
    └── create-company-function-hsmeta.json          → createIcAlpsCompany.js
```

Two card manifests (`new-icalps-deal-contact-*`, `new-icalps-deal-company-*`) point at the same entrypoint (`NewIcAlpsDealCard.tsx`) — HubSpot supports sharing a TSX file across manifests with different `objectTypes`.

---

## 3. Proven patterns (replicate these)

### 3.1 Overlay Panel, not sibling render

HubSpot's `<Panel>` / `<Modal>` components mount **only** when passed in a trigger component's `overlay` prop. Rendering `<Panel>` as a standalone React child is silently dropped — no DOM, no console warning.

```tsx
// ✓ Correct
<Button variant="primary" overlay={<MyPanel id="my-panel" ...>…</MyPanel>}>
  Open
</Button>

// ✗ Wrong — Panel never mounts
<Button onClick={() => setOpen(true)}>Open</Button>
{open && <MyPanel id="my-panel" ...>…</MyPanel>}
```

Close via `actions.closeOverlay(PANEL_ID)` where `PANEL_ID` matches the `Panel`'s `id` prop. Actions type must include `closeOverlay: (id: string) => void`.

### 3.2 Form-level save via diff + serverless

Panels collect user input into local state, build a **diff of only-changed fields** on submit (using `serializeForWrite` + `changed` from `cards/utils/propertyValue.ts`), and invoke `hubspot.serverless(uid, { parameters: { properties, associateTo? } })`. One POST/PATCH per submit, one success/failure boundary, one alert. No partial-success surface.

### 3.3 Property registry as data module

One registry per object type (Deal / Contact / Company). Each holds an ordered list of groups; each group holds `PropertyField` entries with `name`, `label`, `type`, `editable`, optional `required`, optional `options` (for enums), optional `formatStyle` (for percent).

Supported `PROP_TYPE` values: `TEXT`, `NUMBER`, `DATE`, `SELECT`, `LONGTEXT` (rendered as `<TextArea>`), `CALCULATED` (read-only, computed by HubSpot).

Adding a property to a panel = one entry in the relevant config file. Flipping `editable` auto-includes it in the panel body. Flipping `required: true` auto-wires it into the panel's validation (Save refuses when empty, shows "Missing required: <label>").

Enum options are encoded in the config so the `<Select>` renders without extra fetches. Ship with values exactly as the HubSpot portal enumerates them — mismatches return HubSpot's `PROPERTY_VALUE_NOT_RECOGNIZED` on Save. If you need to re-verify option lists, `mcp__claude_ai_HubSpot__get_properties` returns the authoritative snapshot.

### 3.4 Silent association via `context.crm`

Create-from-record cards capture `context.crm.objectId` + `context.crm.objectTypeId` (`"0-1"` = contact, `"0-2"` = company) in the card TSX and forward them to the Panel as `recordObjectId` / `recordObjectTypeId` props. The Panel sends them on the serverless call as `parameters.associateTo`. The function maps `objectTypeId` → `associationTypeId` via a local constant map and attaches an `associations` block to the POST body. If the map has no entry, the function logs and creates the record without association (graceful fallback, preserves V1 behavior when invoked out of record context).

Known `HUBSPOT_DEFINED` unlabeled typeIds:

| From (POST target) | To (associations.to) | `associationTypeId` |
|---|---|---|
| deal | contact | 3 |
| deal | company | 5 |
| contact | company | 1 |
| company | contact | 2 |

### 3.5 Serverless function shape

All four functions share the same shape:

- `exports.main = async (context = {}) => { ... }` entrypoint.
- Destructure `{ properties = {}, associateTo }` from `context.parameters`.
- Guard required fields; return `{ status: 'ERROR', message }` on missing input.
- Read `process.env.PRIVATE_APP_ACCESS_TOKEN` (auto-injected on 2026.03+; no `hs secret add` needed).
- Build `requestBody = { properties: cleanedStringified }`, optionally attach `associations`, POST/PATCH via native `fetch`.
- Parse response into `responseBody` (separate name from `requestBody` — **the var names matter**; see §4.2).
- Return `{ status: 'SUCCESS', id, properties }` on 2xx, `{ status: 'ERROR', message, detail, httpStatus }` on non-2xx.

### 3.6 Hardcoded portal constants with "prod swap" comment

`createIcAlpsDeal.js` has pipeline + stage IDs at the top as `DEFAULT_PIPELINE` / `DEFAULT_DEALSTAGE`. Portal-specific, portable across envs only for HUBSPOT_DEFINED values (association typeIds). Comment explicitly flags the swap point for prod replication. See §5 for the swap playbook.

---

## 4. Known failure modes

### 4.1 Install gate — three gates, not two

| Gate | Check |
|---|---|
| Build | `hs project upload` returns SUCCESS with all subbuilds DONE. |
| Deploy | `hs project list-builds` shows `[deployed]` on the target build. Auto on our default config. |
| **Install** | Must click **Install now** on the app's **Distribution** tab (`hs project open` → app → Distribution). **New scope added = reauthorize on the same tab**; existing install doesn't auto-pick-up new scopes. |

Symptom of missing install: the card doesn't appear in the Customize → Card library when adding to a record view.

Symptom of missing scope reauthorize: the build fails with `This app is missing read scopes for the following object types`, OR the card is installed but the new card on a new objectType doesn't show up in the Card library.

### 4.2 `validate-project` does NOT execute serverless functions

`hs project validate` (and `mcp__HubSpotDev__validate-project`) parses manifests and JS syntax. Runtime errors — undefined variables, scope collisions, throw-on-import — only surface after upload + an actual `hubspot.serverless(…)` invocation.

Real example: build #13 had `const body = { properties: cleaned }` in the request section AND `let body = null` in the response parser. Validate said SUCCESS, build said SUCCESS, deploy said SUCCESS. First Save click → `Identifier 'body' has already been declared`. Fix in #14 renamed request-side to `requestBody`. Lesson: **use distinct names for request and response body vars from day one** (`requestBody` + `responseBody`). All four current functions do this.

### 4.3 Platform version gate — 2025.2 has no serverless

Platform 2025.2 accepts app-function artifacts but has no runtime to host them. Builds stall at 600s. Migration to 2026.03 is a one-line `platformVersion` edit in `hsproject.json` + re-upload + re-install. Don't try to debug as a "timeout" problem — it's a platform-capability gap.

### 4.4 Pipeline / dealstage enum via `get_properties` can be incomplete

`mcp__claude_ai_HubSpot__get_properties` on `pipeline` returned an enum snapshot that **omitted** the IcAlps-facing pipeline `763145477`. Authoritative sources:
- `GET /crm/v3/pipelines/deals` (needs `crm.pipelines.deals.read` or `crm.objects.deals.read`).
- **POST-400 probe**: POST `/crm/v3/objects/deals` with `pipeline` + a deliberately-wrong `dealstage`. HubSpot returns a 400 whose `message` enumerates every valid `pipelineId → [stageIds]` mapping in the portal. Free, fast, portal-accurate.

### 4.5 Two HubSpot MCPs, two portals

- `mcp__HubSpotDev__*` (validate, upload, build-status, docs) → scoped to the project in the working directory → on this repo, **sandbox 49610528**.
- `mcp__claude_ai_HubSpot__*` (search_crm_objects, get_crm_objects, get_properties, search_properties, etc.) → bound to **prod 9201667** via user's personal auth.

Consequence: `claude_ai_HubSpot` CANNOT see records or writes on sandbox. An empty `search_crm_objects` result for a sandbox-created id is **not** evidence the record doesn't exist — it's evidence MCP is looking in the wrong portal. Confirm portal via `get_user_details` (`accountId` field) before inferring from MCP results. For runtime verification of sandbox writes, rely on HubSpot's UI (Associations card on the record) or rebind claude.ai HubSpot MCP to sandbox.

---

## 5. Prod cutover (executed 2026-04-22)

Prod is `wisekeysa` / portal `9201667`. Cutover completed in a dedicated session on **2026-04-22**. New prod app: **appId `37414115`**.

**Portal constants baked into `createIcAlpsDeal.js`:**

| Env | `DEFAULT_PIPELINE` | `DEFAULT_DEALSTAGE` | Meaning |
|---|---|---|---|
| Prod (`9201667`, current) | `766126206` | `1116419644` | Icalps_hardware pipeline / Identified stage |
| Sandbox (`49610528`) | `763145477` | `1113385378` | IcAlps-facing pipeline on sandbox / Identified-equivalent |

Sandbox and prod share pipeline *names* (both expose an "Icalps_hardware" pipeline) but HubSpot generates pipelineIds and stageIds per-portal, so they are not interchangeable.

**The steps that were run (keep as playbook for future env swaps):**

1. **Probe target-portal pipeline + dealstage IDs** via the POST-400 trick. From the target portal, trigger a Create IcAlps deal with any sandbox-valid pipelineId. HubSpot returns a 400 whose `message` enumerates every valid `pipelineId: [stageIds]` mapping in that portal. Free, fast, portal-accurate — more reliable than `get_properties` on `pipeline` (which omitted the IcAlps pipeline entry on the first sandbox probe).
2. **Swap the two constants** in `createIcAlpsDeal.js`. Comment header notes both envs' values so the diff in either direction is one line.
3. **Install app on target portal** via `hs project open --account=<portal>` → app → Distribution → **Install now**. Accept all scopes. On prod, first upload creates a new appId distinct from sandbox.
4. **Add all 5 cards to target-portal record views** via Customize → Default view → ⊕ → Card library → Apps filter:
   - `icalps_deal_card` on Deal
   - `icalps_new_deal_card_contact` on Contact
   - `icalps_new_deal_card_company` on Company
   - `icalps_new_contact_card_company` on Company
   - `icalps_new_company_card_contact` on Contact
5. **Smoke-test each of the 5 paths** with a disposable test record. Confirm success toast id + visible association.
6. **Update this file (§5)** with the new portal's constants + cutover date + appId. Commit on a branch, push, open a PR.

**Commit B on prod also reorganized the property registries** per the user's authoritative property lists. That delta landed in the same branch on 2026-04-22: all four Create panels became registry-driven, new Contact and Company registries were added, `icalps_closedate` (internal name for IcAlps_EffectiveCloseDate) was added to the Deal Timeline group, Pipeline Forecast was dropped from the Deal card, and LONGTEXT support was added for `icalps_dealnotes`.

**Deferred improvement:** use `hs project profile` (`hsprofile.<env>.json`) to source env-specific constants rather than edit-and-redeploy per env. Revisit if env swaps recur — currently the manual two-line constant swap + re-upload is the documented path.

---

## 6. Extending — add a new create card

Recipe (follow any V3a/V3b file as a template):

1. **Card manifest** `src/app/cards/new-{thing}-from-{parent}-hsmeta.json` with unique `uid`, `type: "card"`, `config.entrypoint` pointing at the TSX, `config.objectTypes: ["<parent>"]`.
2. **Card TSX** `src/app/cards/New{Thing}Card.tsx`. Copy `NewIcAlpsContactCard.tsx`:
   - `hubspot.extend<'crm.record.tab'>(({ context, actions }) => …)` pulls both context and actions.
   - Define `Ctx` and `Actions` types.
   - Capture `context.crm.objectId` + `context.crm.objectTypeId`, pass to Panel as props.
   - Button with `overlay={<Panel …/>}`.
3. **Panel TSX** `src/app/cards/New{Thing}Panel.tsx`. Copy `NewIcAlpsContactPanel.tsx`:
   - Props include `addAlert`, `closeOverlay`, optional `recordObjectId` + `recordObjectTypeId`.
   - Local state per form field.
   - `submit()` validates required fields, builds `properties`, wraps origin context into `associateTo`, calls `hubspot.serverless('<function_uid>', { parameters: { properties, associateTo } })`.
   - Success → `addAlert({ type: 'success', …})` → `closeOverlay(PANEL_ID)`. Error → `setErrors([payload.message, payload.detail].filter(Boolean))`.
4. **Function manifest** `src/app/functions/create-{thing}-function-hsmeta.json` with `uid: "create_icalps_{thing}"`, `type: "app-function"`, `config.entrypoint`, `config.secretKeys: []`.
5. **Function JS** `src/app/functions/createIcAlps{Thing}.js`. Copy `createIcAlpsCompany.js`:
   - Top-level constant `{THING}_ASSOCIATION_TYPE_IDS = { '<objectTypeId>': <typeId>, … }`.
   - `exports.main` destructures `{ properties, associateTo }`, guards required fields.
   - Reads `process.env.PRIVATE_APP_ACCESS_TOKEN`.
   - Cleans properties, builds `requestBody`, optionally attaches `associations`.
   - Native `fetch` POST to `/crm/v3/objects/{object-type}`.
   - Parses into `responseBody`, returns structured SUCCESS/ERROR payload.
6. **Scope addition** in `app-hsmeta.json`: add `crm.objects.{thing}.write`. Triggers reauthorize on install.
7. **Upload** via `hs project upload` (or `mcp__HubSpotDev__upload-project`). Check all subbuilds DONE.
8. **Reauthorize install** on Distribution tab (scope diff).
9. **Add card to record view** via Customize → Card library on the parent object type.
10. **Test** end-to-end. If association fails with `INVALID_OPTION` on typeId, the 400's `detail` enumerates valid options → fix the typeId map entry, re-upload.

---

## 7. Open items

- **`hubspot_owner_id` on Deal + Company forms.** Deferred from Commit B. Needs a proper UserSelect dropdown backed by `mcp__claude_ai_HubSpot__search_owners` (or a new `get_owners` serverless function with a `/crm/v3/owners` GET). Once available, adding to the registries is a one-entry change with a new `OWNER` PROP_TYPE and an owner-picker case in `FieldRenderer`.
- **"Primary" association labels.** Currently shipping unlabeled associations (typeId 1, 2, 3, 5). Labeled-primary variants (279 for contact→company primary, 341 for deal→contact primary, etc.) would put a "Primary" badge on the HubSpot UI. Ship on request.
- **Show originating record's name in Panel header.** UX polish — one `fetchCrmObjectProperties` call at Panel mount to display "Creating for **<record name>**".
- **Profile-based portal constants.** `hs project profile` (`hsprofile.<env>.json`) would source env-specific pipeline/stage IDs so swaps don't require a code edit. Worth the ~30 min if env swaps recur.
- **Data-quality schema cleanup.** `icalps_companyaddress` and `icalps_address_postcode` are typed as `number` on the portal. The Company create panel renders them as NumberInput to match the API, but the types are incorrect at the schema level. Fix belongs in the portal's property config, not this card.
- **Repository layout.** `ui-extension/` currently nests inside the broader `HubSpot - Worfklow` repo alongside unrelated Python tooling. Hoist to its own repo post-prod-cutover. Doing it during active feature work would invalidate install paths — do as a standalone cleanup when the feature branch is fully merged.
- **Granular-permission auto-migration.** HubSpot flags a scheduled auto-migration (2026-06-07) on the app's Auth page on both portals. Housekeeping pass; not blocking.

## Completed (milestone log)

- **Prod cutover** completed 2026-04-22 on portal `9201667` (appId `37414115`). Pipeline/stage constants swapped to `766126206` / `1116419644`. See §5.
- **Full IcAlps property coverage on Create panels** — Commit B (2026-04-22). All four Create/Edit panels registry-driven; Contact registry has 20 fields across 4 groups, Company registry has 22 fields across 4 groups, Deal registry reorganized per the prod property list with `icalps_closedate` added and Pipeline Forecast dropped. LONGTEXT / TextArea added for `icalps_dealnotes`.
