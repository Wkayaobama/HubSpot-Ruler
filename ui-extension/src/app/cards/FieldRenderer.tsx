import {
  Input,
  NumberInput,
  DateInput,
  Select,
  TextArea,
  Text,
} from '@hubspot/ui-extensions';
import { PROP_TYPE, type PropertyField } from './icalpsPropertyConfig';

export interface FieldRendererProps {
  field: PropertyField;
  value: unknown;
  readOnly?: boolean;
  onChange?: (v: unknown) => void;
}

// HubSpot deal date properties are Unix ms timestamps (as string). DateInput
// wants a BaseDate {year, month, date}. Round-trip helpers below.
const DASH = '\u2014';

interface BaseDate {
  year: number;
  month: number;
  date: number;
}

const tsToBaseDate = (ts: unknown): BaseDate | undefined => {
  if (ts === null || ts === undefined || ts === '') return undefined;
  const n = Number(ts);
  if (!Number.isFinite(n)) return undefined;
  const d = new Date(n);
  if (Number.isNaN(d.getTime())) return undefined;
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth(),
    date: d.getUTCDate(),
  };
};

const formatReadValue = (field: PropertyField, value: unknown): string => {
  if (value === null || value === undefined || value === '') return DASH;
  if (field.type === PROP_TYPE.DATE) {
    const bd = tsToBaseDate(value);
    if (!bd) return DASH;
    const mm = String(bd.month + 1).padStart(2, '0');
    const dd = String(bd.date).padStart(2, '0');
    return `${bd.year}-${mm}-${dd}`;
  }
  if (field.type === PROP_TYPE.SELECT && field.options) {
    const found = field.options.find((o) => o.value === String(value));
    return found ? found.label : String(value);
  }
  return String(value);
};

const FieldRenderer = ({
  field,
  value,
  readOnly,
  onChange,
}: FieldRendererProps) => {
  if (readOnly || field.type === PROP_TYPE.CALCULATED) {
    return <Text>{formatReadValue(field, value)}</Text>;
  }

  const label = field.label;
  const name = field.name;
  const handle = (v: unknown) => onChange?.(v);

  switch (field.type) {
    case PROP_TYPE.SELECT:
      return (
        <Select
          label={label}
          name={name}
          value={value == null ? '' : String(value)}
          options={field.options ?? []}
          onChange={handle}
        />
      );
    case PROP_TYPE.NUMBER:
      return (
        <NumberInput
          label={label}
          name={name}
          value={
            value === '' || value == null || Number.isNaN(Number(value))
              ? undefined
              : Number(value)
          }
          formatStyle={field.formatStyle ?? 'decimal'}
          onChange={handle}
        />
      );
    case PROP_TYPE.DATE:
      return (
        <DateInput
          label={label}
          name={name}
          value={tsToBaseDate(value)}
          onChange={handle}
        />
      );
    case PROP_TYPE.LONGTEXT:
      return (
        <TextArea
          label={label}
          name={name}
          value={value == null ? '' : String(value)}
          onChange={handle}
        />
      );
    case PROP_TYPE.TEXT:
    default:
      return (
        <Input
          label={label}
          name={name}
          value={value == null ? '' : String(value)}
          onChange={handle}
        />
      );
  }
};

export { tsToBaseDate, formatReadValue };
export default FieldRenderer;
