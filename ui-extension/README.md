# IcAlps CRM Card

HubSpot UI Extension project (Developer Platform **2026.03**). Private static-auth app that surfaces IC'ALPS-specific CRUD affordances on Deal, Contact, and Company records via overlay panels.

**Branch:** `feature/ui-extension-platform-2026.03`
**Sandbox:** `backend-sandbox` / portal `49610528` / appId `37141512`
**Prod:** `wisekeysa` / portal `9201667` — installed as of 2026-04-22, appId `37414115`. Pipeline/stage constants are portal-specific and live at the top of `createIcAlpsDeal.js`; see `docs/ARCHITECTURE.md` §5 for the swap table and replication playbook.

---

## Current state

### Cards (5)

| Card uid | On record | Action |
|---|---|---|
| `icalps_deal_card` | Deal | Edit every non-calculated IcAlps Deal property in one overlay panel. |
| `icalps_new_deal_card_contact` | Contact | Create a new IcAlps deal silently associated to the contact. |
| `icalps_new_deal_card_company` | Company | Create a new IcAlps deal silently associated to the company. |
| `icalps_new_contact_card_company` | Company | Create a new contact silently associated to the company. |
| `icalps_new_company_card_contact` | Contact | Create a new company silently associated to the contact. |

All create cards default `pipeline` + `dealstage` to IcAlps hardware / Identified on the Deal path; swappable for prod via constants in `createIcAlpsDeal.js`.

### Serverless functions (4)

| Function uid | Endpoint | Purpose |
|---|---|---|
| `update_deal_properties` | PATCH `/crm/v3/objects/deals/{id}` | Form-level edit save for IcAlps Deal properties. |
| `create_icalps_deal` | POST `/crm/v3/objects/deals` | Create with hardcoded pipeline + optional association. |
| `create_icalps_contact` | POST `/crm/v3/objects/contacts` | Create with optional association to parent company. |
| `create_icalps_company` | POST `/crm/v3/objects/companies` | Create with optional association to parent contact. |

All four use native `fetch` (Node 18+) and the built-in `PRIVATE_APP_ACCESS_TOKEN` auto-injected on platform 2026.03+.

---

## File layout

```
ui-extension/
├── hsproject.json                      # "platformVersion": "2026.03"
├── README.md                           # this file
├── docs/
│   └── ARCHITECTURE.md                 # patterns, failure modes, prod-cutover playbook
└── src/app/
    ├── app-hsmeta.json                 # app manifest, scopes, permittedUrls
    ├── cards/
    │   ├── *-hsmeta.json               # 5 card manifests
    │   ├── IcAlpsCard.tsx              # Deal: edit
    │   ├── EditStatusPanel.tsx         # shared edit panel
    │   ├── NewIcAlpsDealCard.tsx       # shared card for Contact+Company → Deal create
    │   ├── NewIcAlpsDealPanel.tsx      # create-deal panel
    │   ├── NewIcAlpsContactCard.tsx    # Company → Contact create card
    │   ├── NewIcAlpsContactPanel.tsx   # create-contact panel
    │   ├── NewIcAlpsCompanyCard.tsx    # Contact → Company create card
    │   ├── NewIcAlpsCompanyPanel.tsx   # create-company panel
    │   ├── FieldRenderer.tsx           # input-type switch (Select/Number/Date/Input)
    │   ├── icalpsPropertyConfig.ts     # grouped Deal property registry + editable flags
    │   └── utils/
    │       └── propertyValue.ts        # serializeForWrite, changed, BaseDate
    └── functions/
        ├── *-hsmeta.json               # 4 function manifests
        ├── updateDealProperties.js
        ├── createIcAlpsDeal.js
        ├── createIcAlpsContact.js
        └── createIcAlpsCompany.js
```

---

## Three gates to land a change

1. **Build** — `hs project upload --account=backend-sandbox`. Watch `hs project list-builds` for `[deployed]`.
2. **Deploy** — auto on successful build (no profile config).
3. **Install** — `hs project open` → the app → **Distribution** tab → **Install now**. **Any scope diff forces a reauthorize** on this same tab; existing installs don't auto-pick-up new scopes. New card registration on a new objectType triggers this.

After all three gates: Deal/Contact/Company record → **Customize** → Default view → pick a tab → ⊕ → **Card library** → filter **Apps** → find the card by name → Add → Save and exit.

---

## Dev loop

```bash
# Upload & build (auto-deploys)
hs project upload --account=backend-sandbox

# Verify
hs project list-builds --account=backend-sandbox

# Platform 2026.03 auto-injects PRIVATE_APP_ACCESS_TOKEN — no `hs secret add` needed.

# Live dev with hot reload (requires a developer test account, not a standard sandbox).
hs project dev

# Utilities
hs project open --account=backend-sandbox
hs project logs --account=backend-sandbox
```

---

## Architectural overview

See `docs/ARCHITECTURE.md` for the full patterns + failure modes + extending guide. Short version:

- **Overlay Panel pattern.** `<Panel>` mounts only inside a trigger's `overlay` prop. Rendering as a sibling is silently dropped. Close via `actions.closeOverlay(PANEL_ID)`.
- **Property registry.** `icalpsPropertyConfig.ts` is the single source for Deal properties; flipping `editable: true` auto-includes a field in the edit Panel.
- **Silent association.** Create cards capture `context.crm.{objectId, objectTypeId}`, forward to the serverless function, which attaches `associations[]` to the POST using HUBSPOT_DEFINED typeIds. Graceful fallback: unknown objectTypeId → create without association, log the skip.
- **Form-level save.** One submit = one serverless call = one success/failure alert. No partial-success surface.
- **Portal constants isolated.** `createIcAlpsDeal.js` carries `DEFAULT_PIPELINE` + `DEFAULT_DEALSTAGE` at top-of-file for trivial prod swap.

---

## Extending

Add a property to the Deal registry: one entry in `src/app/cards/icalpsPropertyConfig.ts`. Flip `editable: true` to include in edit Panel.

Add a new create card (e.g., new object type or new parent context): copy any `New*Card.tsx` + `New*Panel.tsx` + `create*.js` + their two manifests. Adjust `objectTypes`, `associationTypeId` mapping, and any required fields. See `docs/ARCHITECTURE.md` §6 for the full recipe.

Replicate to prod: see `docs/ARCHITECTURE.md` §5.

---

## Migration history

Originally scaffolded on platform **2025.2**. Migrated to **2026.03** because 2025.2 does not support serverless functions — app-function builds stalled at 600s (no runtime to host them). Migration was a one-line `platformVersion` edit + re-upload + re-install.

The overlay-in-prop Panel rule was discovered via a dead-modal bug fixed in commit `d0a2b91`. The pipeline/dealstage probe via `get_properties` was found unreliable (omitted the IcAlps-facing pipeline); the POST-400 enumeration trick gave the correct IDs on first try. Both lessons captured in `docs/ARCHITECTURE.md` §4.
