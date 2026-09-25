// Contact property registry for the NewIcAlpsContactPanel (Create Contact
// from a Company record).
// Types + enum options sourced via mcp__claude_ai_HubSpot__get_properties
// against prod portal 9201667 (2026-04-22).
// Shape mirrors icalpsPropertyConfig.ts — imports PROP_TYPE + interfaces
// to keep the FieldRenderer / utils/propertyValue pipeline reusable.
//
// Dropped from the original user list:
// - icalps_address_country (doesn't exist on Contact; native `country`
//   covers it)
// - hs_language (260+ enum options would create a poor Select UX;
//   icalps_language covers the IcAlps workflow)
// Added via follow-up: hs_linkedin_url (the correct internal name for
// what was listed as "linkedin_url" — prod exposes this as the standard
// HubSpot LinkedIn URL property).
//
// Email is the only required field for the create path (HubSpot accepts
// a contact with just email; other fields are optional).

import {
  PROP_TYPE,
  type PropertyField,
  type PropertyGroup,
} from './icalpsPropertyConfig';

const CHANNELS_FIELDS: PropertyField[] = [
  {
    name: 'email',
    label: 'Email',
    type: PROP_TYPE.TEXT,
    editable: true,
    required: true,
  },
  { name: 'icalps_businessphone', label: 'IcAlps_BusinessPhone', type: PROP_TYPE.TEXT, editable: true },
  { name: 'icalps_mobilephone', label: 'IcAlps_MobilePhone', type: PROP_TYPE.TEXT, editable: true },
  { name: 'hs_linkedin_url', label: 'LinkedIn URL', type: PROP_TYPE.TEXT, editable: true },
];

const IDENTITY_FIELDS: PropertyField[] = [
  { name: 'firstname', label: 'First Name', type: PROP_TYPE.TEXT, editable: true },
  { name: 'lastname', label: 'Last Name', type: PROP_TYPE.TEXT, editable: true },
  { name: 'salutation', label: 'Salutation', type: PROP_TYPE.TEXT, editable: true },
  { name: 'icalps_perstitle', label: 'Icalps_PersTitle', type: PROP_TYPE.TEXT, editable: true },
  { name: 'jobtitle', label: 'Job Title', type: PROP_TYPE.TEXT, editable: true },
  { name: 'gender', label: 'Gender', type: PROP_TYPE.TEXT, editable: true },
  {
    name: 'icalps_contactstatus',
    label: 'icalps_contactstatus',
    type: PROP_TYPE.SELECT,
    editable: true,
    options: [
      { value: 'true', label: 'active' },
      { value: 'false', label: 'inactive' },
    ],
  },
  {
    name: 'hs_marketable_status',
    label: 'Marketing contact status',
    type: PROP_TYPE.SELECT,
    editable: true,
    options: [
      { value: 'true', label: 'Marketing contact' },
      { value: 'false', label: 'Non-marketing contact' },
    ],
  },
  {
    name: 'email_valid',
    label: 'email_valid',
    type: PROP_TYPE.SELECT,
    editable: true,
    options: [
      { value: 'true', label: 'Yes' },
      { value: 'false', label: 'No' },
    ],
  },
  { name: 'icalps_department', label: 'icalps_department', type: PROP_TYPE.TEXT, editable: true },
];

const LANGUAGE_FIELDS: PropertyField[] = [
  { name: 'icalps_language', label: 'icalps_language', type: PROP_TYPE.TEXT, editable: true },
];

const LOCATION_FIELDS: PropertyField[] = [
  { name: 'icalps_addresscity', label: 'IcAlps_AddressCity', type: PROP_TYPE.TEXT, editable: true },
  { name: 'city', label: 'City', type: PROP_TYPE.TEXT, editable: true },
  { name: 'state', label: 'State/Region', type: PROP_TYPE.TEXT, editable: true },
  { name: 'country', label: 'Country/Region', type: PROP_TYPE.TEXT, editable: true },
  { name: 'zip', label: 'Postal Code', type: PROP_TYPE.TEXT, editable: true },
];

export const CONTACT_GROUPS: PropertyGroup[] = [
  { key: 'channels', label: 'Contact channels', fields: CHANNELS_FIELDS },
  { key: 'identity', label: 'Identity', fields: IDENTITY_FIELDS },
  { key: 'language', label: 'Language', fields: LANGUAGE_FIELDS },
  { key: 'location', label: 'Location', fields: LOCATION_FIELDS },
];

export const EDITABLE_CONTACT_FIELDS: PropertyField[] = CONTACT_GROUPS
  .flatMap((g) => g.fields)
  .filter((f) => f.editable);
