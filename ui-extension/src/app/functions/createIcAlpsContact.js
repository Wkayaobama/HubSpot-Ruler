// createIcAlpsContact.js
// V3a: POST /crm/v3/objects/contacts with native contact fields (email
// required, plus optional firstname/lastname/phone/jobtitle) and an
// optional `associations` block so the new contact is silently linked
// to the originating Company when invoked from a Company record card.
//
// Platform 2026.03 auto-injects PRIVATE_APP_ACCESS_TOKEN.
// Association typeIds are HubSpot-defined and portable across portals.

const HUBSPOT_API = 'https://api.hubapi.com';

// HubSpot-defined association typeIds for contact -> other-object.
// Direction is contact-outbound because the POST target is /contacts and
// the `to` field in associations points to the originating record.
const CONTACT_ASSOCIATION_TYPE_IDS = {
  '0-2': 1, // contact_to_company (unlabeled)
};

exports.main = async (context = {}) => {
  try {
    const { properties = {}, associateTo } = context.parameters || {};

    if (!properties || typeof properties !== 'object') {
      return { status: 'ERROR', message: 'properties object missing.' };
    }
    if (!properties.email || String(properties.email).trim() === '') {
      return { status: 'ERROR', message: 'email is required.' };
    }

    const token = process.env.PRIVATE_APP_ACCESS_TOKEN;
    if (!token) {
      return {
        status: 'ERROR',
        message:
          'PRIVATE_APP_ACCESS_TOKEN is not available. This should be auto-injected on platform 2026.03+; indicates a platform configuration issue.',
      };
    }

    // Strip empty values and stringify — HubSpot expects string values.
    const cleaned = {};
    for (const k of Object.keys(properties)) {
      const v = properties[k];
      if (v === null || v === undefined || v === '') continue;
      cleaned[k] = String(v);
    }

    const requestBody = { properties: cleaned };

    if (associateTo && associateTo.objectId && associateTo.objectTypeId) {
      const typeId = CONTACT_ASSOCIATION_TYPE_IDS[associateTo.objectTypeId];
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
          `[createIcAlpsContact] unknown associateTo.objectTypeId=${associateTo.objectTypeId}; creating contact without association.`,
        );
      }
    }

    const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/contacts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const text = await res.text();
    let responseBody = null;
    try {
      responseBody = text ? JSON.parse(text) : null;
    } catch (_e) {
      responseBody = { rawText: text };
    }

    if (res.ok) {
      return {
        status: 'SUCCESS',
        id: responseBody && responseBody.id,
        properties: responseBody && responseBody.properties,
      };
    }

    return {
      status: 'ERROR',
      message: (responseBody && responseBody.message) || `HubSpot API error (${res.status}).`,
      detail: responseBody ? JSON.stringify(responseBody).slice(0, 800) : undefined,
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
