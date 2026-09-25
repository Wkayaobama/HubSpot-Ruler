// createIcAlpsDeal.js
// V2: POST /crm/v3/objects/deals with dealname + IcAlps namespaced properties.
// Pipeline + dealstage are forced to Icalps_hardware / Identified because the
// IcAlps user tracks stage via icalps_stage, not the native dealstage.
//
// When context.parameters includes { associateTo: { objectId, objectTypeId } },
// an `associations` array is attached to the POST so the new deal is silently
// linked to the originating Contact ("0-1") or Company ("0-2") record.
// Unknown objectTypeIds are logged and skipped — deal still creates cleanly.
//
// Platform 2026.03 auto-injects PRIVATE_APP_ACCESS_TOKEN.
// When replicating on prod (portal 9201667), update the two pipeline/stage
// IDs below — the association typeIds are HubSpot-defined and portable.

const HUBSPOT_API = 'https://api.hubapi.com';

// Prod 9201667 — Icalps_hardware pipeline + Identified stage.
// User-confirmed values from the prod portal (the IcAlps sandbox was
// replicated from prod, but pipeline/stage internal IDs are generated
// per-portal, so sandbox IDs are different and cannot be reused).
// Sandbox equivalents (if ever swapping back): pipeline 763145477,
// stage 1113385378.
const DEFAULT_PIPELINE = '766126206';
const DEFAULT_DEALSTAGE = '1116419644';

// HubSpot-defined association typeIds for deal -> other-object.
// Portable across portals (HUBSPOT_DEFINED associations are global).
// Direction is deal-outbound because the POST target is /deals and the
// `to` field in associations points to the originating record.
const DEAL_ASSOCIATION_TYPE_IDS = {
  '0-1': 3, // deal_to_contact (unlabeled)
  '0-2': 5, // deal_to_company (unlabeled)
};

exports.main = async (context = {}) => {
  try {
    const { properties = {}, associateTo } = context.parameters || {};

    if (!properties || typeof properties !== 'object') {
      return { status: 'ERROR', message: 'properties object missing.' };
    }
    const dealname = properties.dealname;
    if (!dealname || String(dealname).trim() === '') {
      return { status: 'ERROR', message: 'dealname is required.' };
    }

    const token = process.env.PRIVATE_APP_ACCESS_TOKEN;
    if (!token) {
      return {
        status: 'ERROR',
        message:
          'PRIVATE_APP_ACCESS_TOKEN is not available. This should be auto-injected on platform 2026.03+; indicates a platform configuration issue.',
      };
    }

    // Strip null/undefined/empty, stringify everything else, overlay the
    // pipeline + dealstage defaults last so caller cannot override them.
    const cleaned = {};
    for (const k of Object.keys(properties)) {
      const v = properties[k];
      if (v === null || v === undefined || v === '') continue;
      cleaned[k] = String(v);
    }
    cleaned.pipeline = DEFAULT_PIPELINE;
    cleaned.dealstage = DEFAULT_DEALSTAGE;

    const requestBody = { properties: cleaned };

    if (associateTo && associateTo.objectId && associateTo.objectTypeId) {
      const typeId = DEAL_ASSOCIATION_TYPE_IDS[associateTo.objectTypeId];
      if (typeId) {
        requestBody.associations = [
          {
            to: { id: String(associateTo.objectId) },
            types: [
              {
                associationCategory: 'HUBSPOT_DEFINED',
                associationTypeId: typeId,
              },
            ],
          },
        ];
      } else {
        console.log(
          `[createIcAlpsDeal] unknown associateTo.objectTypeId=${associateTo.objectTypeId}; creating deal without association.`,
        );
      }
    }

    const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/deals`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch (_e) {
      body = { rawText: text };
    }

    if (res.ok) {
      return {
        status: 'SUCCESS',
        id: body && body.id,
        properties: body && body.properties,
      };
    }

    return {
      status: 'ERROR',
      message: (body && body.message) || `HubSpot API error (${res.status}).`,
      detail: body ? JSON.stringify(body).slice(0, 800) : undefined,
      httpStatus: res.status,
    };
  } catch (err) {
    return {
      status: 'ERROR',
      message: (err && err.message) || 'Unknown error.',
      detail: err && err.stack ? err.stack.split('\n').slice(0, 5).join('\n') : undefined,
    };
  }
};
