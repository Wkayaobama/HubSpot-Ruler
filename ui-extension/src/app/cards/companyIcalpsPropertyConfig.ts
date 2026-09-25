// Company property registry for the NewIcAlpsCompanyPanel (Create Company
// from a Contact record).
// Types + enum options sourced via mcp__claude_ai_HubSpot__get_properties
// against prod portal 9201667 (2026-04-22).
//
// Notes:
// - icalps_companystate: user wrote "icalps_company_state" in the list;
//   internal name on prod is `icalps_companystate` (no underscore).
// - icalps_companyaddress: prod types this as `number`. Known data-quality
//   issue from PRD §3; rendering as NumberInput since that's what the API
//   accepts. Schema fix belongs in a separate cleanup, not this card.
// - icalps_address_postcode: also typed as `number` on prod.
// - name is the only required field; HubSpot will accept a company with
//   just `name` (no domain).

import {
  PROP_TYPE,
  type PropertyField,
  type PropertyGroup,
} from './icalpsPropertyConfig';

const IDENTITY_FIELDS: PropertyField[] = [
  {
    name: 'name',
    label: 'Company name',
    type: PROP_TYPE.TEXT,
    editable: true,
    required: true,
  },
  {
    name: 'icalps_companytype',
    label: 'IcAlps_CompanyType',
    type: PROP_TYPE.SELECT,
    editable: true,
    options: [
      { value: 'Prospect', label: 'Prospect' },
      { value: 'Supplier', label: 'Supplier' },
      { value: 'Customer', label: 'Customer' },
      { value: 'Agent', label: 'Agent' },
    ],
  },
  {
    name: 'icalps_companystatus',
    label: 'IcAlps_CompanyStatus',
    type: PROP_TYPE.SELECT,
    editable: true,
    options: [
      { value: 'Active', label: 'Active' },
      { value: 'Inactive', label: 'Inactive' },
      { value: 'Closed', label: 'Closed' },
    ],
  },
  {
    name: 'icalps_compsource',
    label: 'IcAlps_CompSource',
    type: PROP_TYPE.SELECT,
    editable: true,
    options: [
      { value: 'Phone', label: 'Phone' },
      { value: 'Web', label: 'Web' },
      { value: 'Prospection', label: 'Prospection' },
      { value: 'Salon', label: 'Salon' },
      { value: 'Prospection LinkedIn', label: 'Prospection LinkedIn' },
      { value: 'Prospection Medicen', label: 'Prospection Medicen' },
      { value: 'EW', label: 'EW' },
      { value: 'Prospection Medicalp', label: 'Prospection Medicalp' },
      { value: 'Prospection startup ETHZ', label: 'Prospection startup ETHZ' },
      { value: 'Prospection VC', label: 'Prospection VC' },
    ],
  },
  { name: 'icalps_comp_website', label: 'IcAlps_Comp_WebSite', type: PROP_TYPE.TEXT, editable: true },
  { name: 'domain', label: 'Company Domain Name', type: PROP_TYPE.TEXT, editable: true },
  { name: 'linkedin_company_page', label: 'LinkedIn Company Page', type: PROP_TYPE.TEXT, editable: true },
];

const CONTACT_INFO_FIELDS: PropertyField[] = [
  { name: 'icalps_companyphone', label: 'Icalps_CompanyPhone', type: PROP_TYPE.TEXT, editable: true },
  { name: 'icalps_companyemail', label: 'IcAlps_CompanyEmail', type: PROP_TYPE.TEXT, editable: true },
  { name: 'icalps_companyprimarycontact', label: 'IcAlps_CompanyPrimaryContact', type: PROP_TYPE.TEXT, editable: true },
];

const CLASSIFICATION_FIELDS: PropertyField[] = [
  {
    name: 'icalps_comp_language',
    label: 'IcAlps_Comp_Language',
    type: PROP_TYPE.SELECT,
    editable: true,
    options: [
      { value: 'FR', label: 'FR' },
      { value: 'INTER', label: 'INTER' },
    ],
  },
  {
    name: 'icalps_comp_numemployees',
    label: 'icalps_Comp_NumEmployees',
    type: PROP_TYPE.SELECT,
    editable: true,
    options: [
      { value: '20', label: '20' },
      { value: '21-50', label: '21-50' },
      { value: '51-100', label: '51-100' },
      { value: '101-200', label: '101-200' },
      { value: '201-500', label: '201-500' },
      { value: '501+', label: '501+' },
    ],
  },
  { name: 'icalps_comp_territory', label: 'IcAlps_Comp_Territory', type: PROP_TYPE.TEXT, editable: true },
  {
    name: 'icalps_company_sector',
    label: 'IcAlps_Company_sector',
    type: PROP_TYPE.SELECT,
    editable: true,
    options: [
      { value: 'Recherche', label: 'Recherche' },
      { value: 'Industriel', label: 'Industriel' },
      { value: 'Medical', label: 'Medical' },
      { value: 'Consumer', label: 'Consumer' },
      { value: 'Spacial', label: 'Spacial' },
      { value: 'Agent', label: 'Agent' },
      { value: 'Semiconducteur', label: 'Semiconducteur' },
      { value: 'Transportation', label: 'Transportation' },
      { value: 'Autre', label: 'Autre' },
      { value: 'Telecom', label: 'Telecom' },
      { value: 'IoT', label: 'IoT' },
      { value: 'Militaire', label: 'Militaire' },
      { value: 'Aeronautique', label: 'Aeronautique' },
    ],
  },
  {
    name: 'icalps_industry_drill_down',
    label: 'icalps_Industry_drill_down',
    type: PROP_TYPE.SELECT,
    editable: true,
    options: [
      { value: 'Semiconducteur', label: 'Semiconducteur' },
      { value: 'Autre', label: 'Autre' },
      { value: 'IoT', label: 'IoT' },
      { value: 'Medical', label: 'Medical' },
      { value: 'Industriel', label: 'Industriel' },
      { value: 'Consumer', label: 'Consumer' },
      { value: 'Militaire', label: 'Militaire' },
      { value: 'Aeronautique', label: 'Aeronautique' },
      { value: 'Spacial', label: 'Spacial' },
      { value: 'Recherche', label: 'Recherche' },
      { value: 'Transportation', label: 'Transportation' },
      { value: 'Universite', label: 'Universite' },
      { value: 'Government', label: 'Government' },
      { value: 'Telecom', label: 'Telecom' },
      { value: 'Agent', label: 'Agent' },
    ],
  },
];

const ADDRESS_FIELDS: PropertyField[] = [
  // Known data-quality issue: icalps_companyaddress is typed as number on prod.
  // Render as NumberInput to match the API; clean up at the schema level later.
  { name: 'icalps_companyaddress', label: 'IcAlps_CompanyAddress', type: PROP_TYPE.NUMBER, editable: true },
  { name: 'icalps_street_address', label: 'IcAlps_Street_Address', type: PROP_TYPE.TEXT, editable: true },
  { name: 'city', label: 'City', type: PROP_TYPE.TEXT, editable: true },
  { name: 'icalps_companystate', label: 'icalps_CompanyState', type: PROP_TYPE.TEXT, editable: true },
  { name: 'icalps_address_postcode', label: 'IcAlps_Address_PostCode', type: PROP_TYPE.NUMBER, editable: true },
  {
    name: 'icalps_address_country',
    label: 'IcAlps_Address_Country',
    type: PROP_TYPE.SELECT,
    editable: true,
    options: [
      { value: 'FR', label: 'FR' },
      { value: 'NL', label: 'NL' },
      { value: 'BE', label: 'BE' },
      { value: 'CH', label: 'CH' },
      { value: 'DE', label: 'DE' },
      { value: 'IT', label: 'IT' },
      { value: 'AT', label: 'AT' },
      { value: 'NO', label: 'NO' },
      { value: 'SE', label: 'SE' },
      { value: 'UK', label: 'UK' },
      { value: 'ES', label: 'ES' },
      { value: 'IE', label: 'IE' },
      { value: 'BG', label: 'BG' },
      { value: 'FI', label: 'FI' },
      { value: 'DK', label: 'DK' },
      { value: 'HK', label: 'HK' },
      { value: 'US', label: 'US' },
      { value: 'GR', label: 'GR' },
      { value: 'GB', label: 'GB' },
      { value: 'CA', label: 'CA' },
      { value: 'CZ', label: 'CZ' },
      { value: 'CN', label: 'CN' },
    ],
  },
];

export const COMPANY_GROUPS: PropertyGroup[] = [
  { key: 'identity', label: 'Identity', fields: IDENTITY_FIELDS },
  { key: 'contact-info', label: 'Contact info', fields: CONTACT_INFO_FIELDS },
  { key: 'classification', label: 'Classification', fields: CLASSIFICATION_FIELDS },
  { key: 'address', label: 'Address', fields: ADDRESS_FIELDS },
];

export const EDITABLE_COMPANY_FIELDS: PropertyField[] = COMPANY_GROUPS
  .flatMap((g) => g.fields)
  .filter((f) => f.editable);
