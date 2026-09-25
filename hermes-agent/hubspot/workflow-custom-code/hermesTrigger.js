// hermesTrigger.js — HubSpot workflow "Custom code" action (Node.js runtime).
//
// Paste this into a Custom code action in any HubSpot workflow to trigger
// the Hermes agent on the VPS. Requires Operations Hub Professional+.
//
// Action setup in the workflow editor:
//   1. Language: Node.js (axios is preloaded in the custom-code runtime).
//   2. Secrets: add HERMES_WEBHOOK_SECRET (same value as the VPS .env) and
//      HERMES_BRIDGE_URL (e.g. https://agent.example.com/hooks/hubspot).
//   3. Property to include in code: map the fields you want the agent to
//      see (they arrive as event.inputFields), e.g. hs_object_id, dealname.
//   4. Data outputs: hermes_status (string), hermes_task_id (string) —
//      usable in later workflow branches.
//
// HERMES_ACTION below selects the task template on the bridge:
//   deal_review | contact_enrich | company_brief | revops_digest | custom
// For "custom", also add a 'prompt' input field or hardcode one here.

const axios = require('axios');
const crypto = require('crypto');

const HERMES_ACTION = 'deal_review'; // <-- set per workflow
const OBJECT_TYPE = 'deal';          // <-- 'deal' | 'contact' | 'company'

exports.main = async (event, callback) => {
  const secret = process.env.HERMES_WEBHOOK_SECRET;
  const url = process.env.HERMES_BRIDGE_URL;
  if (!secret || !url) {
    throw new Error('Missing HERMES_WEBHOOK_SECRET / HERMES_BRIDGE_URL secrets on this action.');
  }

  const payload = {
    action: HERMES_ACTION,
    objectType: OBJECT_TYPE,
    objectId: String(event.object.objectId),
    portalId: String(event.origin && event.origin.portalId ? event.origin.portalId : ''),
    inputFields: event.inputFields || {},
  };

  const rawBody = JSON.stringify(payload);
  const timestamp = Date.now().toString();
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  const response = await axios.post(url, rawBody, {
    headers: {
      'Content-Type': 'application/json',
      'X-Hermes-Timestamp': timestamp,
      'X-Hermes-Signature': `sha256=${signature}`,
    },
    timeout: 10000, // stay well inside the custom-code execution limit
    // The bridge answers 2xx immediately (task is queued, not executed
    // inline), so this call is fast even when the agent's work is long.
  });

  callback({
    outputFields: {
      hermes_status: response.data && response.data.status ? response.data.status : 'unknown',
      hermes_task_id: response.data && response.data.taskId ? response.data.taskId : '',
    },
  });
};
