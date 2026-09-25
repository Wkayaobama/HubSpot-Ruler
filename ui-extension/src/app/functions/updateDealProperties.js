// Form-level save for IcAlps Deal properties.
// Invoked from the card via `hubspot.serverless('update_deal_properties',
// { parameters: { dealId, properties } })`.
//
// Returns { status: 'SUCCESS' | 'ERROR', id?, message?, detail? }.
// Uses native fetch (Node 18+); no @hubspot/api-client dep.
// Platform 2026.03 auto-injects PRIVATE_APP_ACCESS_TOKEN as a built-in
// secret for every private-app serverless function.

const HUBSPOT_API = 'https://api.hubapi.com';

exports.main = async (context = {}) => {
  try {
    const { dealId, properties = {} } = context.parameters || {};

    if (!dealId) {
      return { status: 'ERROR', message: 'Missing dealId.' };
    }
    if (!properties || typeof properties !== 'object' || Object.keys(properties).length === 0) {
      return { status: 'ERROR', message: 'No properties submitted.' };
    }

    const token = process.env.PRIVATE_APP_ACCESS_TOKEN;
    if (!token) {
      return {
        status: 'ERROR',
        message:
          'PRIVATE_APP_ACCESS_TOKEN is not available. This should be auto-injected on platform 2026.03+; indicates a platform configuration issue.',
      };
    }

    // HubSpot wants string values for property writes; the card already
    // serialized dates to epoch-ms strings and numbers to numeric strings,
    // but defensive-stringify here for safety. null/undefined -> skip.
    const payload = {};
    for (const key of Object.keys(properties)) {
      const value = properties[key];
      if (value === null || value === undefined) continue;
      payload[key] = String(value);
    }

    if (Object.keys(payload).length === 0) {
      return { status: 'ERROR', message: 'All submitted values were null.' };
    }

    const url = `${HUBSPOT_API}/crm/v3/objects/deals/${encodeURIComponent(String(dealId))}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ properties: payload }),
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
