// Shared serialization helpers for IcAlps property panels.
// Extracted from EditStatusPanel + NewIcAlpsDealPanel ahead of V3 panels
// (NewIcAlpsContactPanel, NewIcAlpsCompanyPanel) that will use the same
// value -> HubSpot-API-string conversion rules.
//
// HubSpot's /crm/v3/objects/{type} POST + PATCH endpoints want every
// property value as a string:
//   - DATE   : epoch-ms at UTC midnight, as a numeric string
//   - NUMBER : numeric string
//   - SELECT / TEXT / CALCULATED : as-is string
//
// These helpers normalize the UI's native shapes (BaseDate from DateInput,
// number from NumberInput, string from Select/Input) into that wire format,
// returning null for empty/invalid inputs so the caller can skip them.

import { PROP_TYPE, type PropType } from '../icalpsPropertyConfig';

export interface BaseDate {
  year: number;
  month: number;
  date: number;
}

export const serializeForWrite = (
  value: unknown,
  kind: PropType,
): string | null => {
  if (value === null || value === undefined || value === '') return null;

  if (kind === PROP_TYPE.DATE) {
    const bd = value as BaseDate;
    if (
      typeof bd?.year !== 'number' ||
      typeof bd?.month !== 'number' ||
      typeof bd?.date !== 'number'
    ) {
      return null;
    }
    return String(Date.UTC(bd.year, bd.month, bd.date));
  }

  if (kind === PROP_TYPE.NUMBER) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return String(n);
  }

  return String(value);
};

// Compare two serialized values; normalizes empty <-> null so an empty
// string and an absent value are treated as equivalent. Used by Edit
// panels to build a diff of only-changed fields before calling Save.
export const changed = (a: string | null, b: string | null): boolean => {
  const na = a == null || a === '' ? null : a;
  const nb = b == null || b === '' ? null : b;
  return na !== nb;
};
