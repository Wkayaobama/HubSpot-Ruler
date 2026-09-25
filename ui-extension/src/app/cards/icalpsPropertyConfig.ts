// Deal property registry.
// Source of truth: user property list (2026-04-22) captured during prod
// cutover to portal 9201667. See docs/ARCHITECTURE.md §3.3 for the
// registry pattern; contactIcalpsPropertyConfig.ts and
// companyIcalpsPropertyConfig.ts mirror this shape for Contact/Company.
//
// `editable: true` fields appear in the edit / create panel; calculated
// and derived fields stay out of the panel body. Flipping `editable`
// on a property is the one-file change to extend the edit surface.

export const PROP_TYPE = {
  TEXT: 'text',
  NUMBER: 'number',
  DATE: 'date',
  SELECT: 'select',
  LONGTEXT: 'longtext', // rendered as <TextArea> in FieldRenderer
  CALCULATED: 'calculated', // read-only, computed by HubSpot
} as const;

export type PropType = (typeof PROP_TYPE)[keyof typeof PROP_TYPE];

export interface EnumOption {
  value: string;
  label: string;
}

export interface PropertyField {
  name: string;
  label: string;
  type: PropType;
  editable: boolean;
  required?: boolean;
  options?: EnumOption[];
  formatStyle?: 'decimal' | 'percentage';
}

export interface PropertyGroup {
  key: string;
  label: string;
  fields: PropertyField[];
}

// ---- Deal groups ----------------------------------------------------------

const STATUS_FIELDS: PropertyField[] = [
  {
    name: 'amount',
    label: 'Amount',
    type: PROP_TYPE.NUMBER,
    editable: true,
  },
  {
    name: 'icalps_stage',
    label: 'IcAlps_Stage',
    type: PROP_TYPE.SELECT,
    editable: true,
    options: [
      { value: '01 - Identification', label: '01 - Identification' },
      { value: '02 - Qualifiée', label: '02 - Qualifiée' },
      { value: '03 - Evaluation technique', label: '03 - Evaluation technique' },
      { value: '04 - Construction propositions', label: '04 - Construction propositions' },
      { value: '05 - Négociations', label: '05 - Négociations' },
    ],
  },
  {
    name: 'icalps_dealstatus',
    label: "IC'ALPS Status",
    type: PROP_TYPE.SELECT,
    editable: true,
    options: [
      { value: 'En cours', label: 'En cours' },
      { value: 'In Progress', label: 'In Progress' },
      { value: 'Gagnée', label: 'Gagnée' },
      { value: 'Won', label: 'Won' },
      { value: 'Perdue', label: 'Perdue' },
      { value: 'Lost', label: 'Lost' },
      { value: 'Abandonnée', label: 'Abandonné' },
      { value: 'Abandoned', label: 'Abandoned' },
      { value: 'NoGo', label: 'NoGo' },
      { value: 'Sleep', label: 'Sleep' },
    ],
  },
  {
    name: 'icalps_oppocertainty',
    label: 'IcAlps_OppoCertainty',
    type: PROP_TYPE.NUMBER,
    editable: true,
    formatStyle: 'percentage',
  },
];

const IDENTITY_FIELDS: PropertyField[] = [
  {
    name: 'dealname',
    label: 'Deal Name',
    type: PROP_TYPE.TEXT,
    editable: true,
    required: true,
  },
  {
    name: 'icalps_dealtype',
    label: 'icalps_dealtype',
    type: PROP_TYPE.TEXT,
    editable: true,
  },
  {
    name: 'icalps_dealnotes',
    label: 'icalps_dealnotes',
    type: PROP_TYPE.LONGTEXT,
    editable: true,
  },
  {
    name: 'ic_alps_cost',
    label: 'IcAlps_cost (k€)',
    type: PROP_TYPE.NUMBER,
    editable: true,
  },
];

const TIMELINE_FIELDS: PropertyField[] = [
  { name: 'icalps_opendate', label: 'IcAlps_OpenDate', type: PROP_TYPE.DATE, editable: true },
  { name: 'closedate', label: 'Close Date', type: PROP_TYPE.DATE, editable: true },
  // Internal name is icalps_closedate; display label is IcAlps_EffectiveCloseDate on prod.
  { name: 'icalps_closedate', label: 'IcAlps_EffectiveCloseDate', type: PROP_TYPE.DATE, editable: true },
];

const CALCULATED_FIELDS: PropertyField[] = [
  { name: 'ccicalps_weightedamount', label: '[cc] Weighted Amount', type: PROP_TYPE.CALCULATED, editable: false },
  { name: 'ccicalps_netamount', label: '[cc] Net Amount', type: PROP_TYPE.CALCULATED, editable: false },
  { name: 'ccicalps_netweightedamount', label: '[cc] Net Weighted Amount', type: PROP_TYPE.CALCULATED, editable: false },
];

export const DEAL_GROUPS: PropertyGroup[] = [
  { key: 'status', label: 'Status', fields: STATUS_FIELDS },
  { key: 'identity', label: 'Identity', fields: IDENTITY_FIELDS },
  { key: 'timeline', label: 'Timeline', fields: TIMELINE_FIELDS },
  { key: 'calculated', label: 'Calculated', fields: CALCULATED_FIELDS },
];

export const EDITABLE_FIELDS: PropertyField[] = DEAL_GROUPS
  .flatMap((g) => g.fields)
  .filter((f) => f.editable);

export const ALL_PROPERTY_KEYS: string[] = DEAL_GROUPS.flatMap((g) =>
  g.fields.map((f) => f.name),
);

// EXPLICITLY EXCLUDED (2026-04-22 per user; mental-model fields not real deal properties):
// - associated_company / associated_Contact (associations, not properties)
// - icalps_companyphone (this is a Company property, not a Deal one)
// - icalps_dealsource, icalps_amount_k__, icalps_netamount_k__,
//   icalps_targetclose, icalps_oppo_updateddate, icalps_primarycontactlastname
//   (dropped during prod cutover property-list reorganization).
// - pipeline2025/2026, services_value_2025/2026 (Forecast group dropped;
//   belongs on a reporting surface, not in the per-deal panel).
// Also excluded per prior PRD §8:
// - icalps_original_status (redundant with icalps_dealstatus)
// - icalps_netamount (string type, unreliable)
// - cctest_icalps_netamount (test property)
// - hs_deal_stage_probability (native HubSpot, not IC'ALPS)
//
// DEFERRED (expected in a small follow-up):
// - hubspot_owner_id — needs a UserSelect backed by search_owners; skip
//   until the owner-picker UX is built.
