import { useState } from 'react';
import {
  Panel,
  PanelBody,
  PanelFooter,
  Flex,
  Button,
  Text,
  Alert,
  LoadingSpinner,
  hubspot,
} from '@hubspot/ui-extensions';
import { DEAL_GROUPS, EDITABLE_FIELDS } from './icalpsPropertyConfig';
import FieldRenderer from './FieldRenderer';
import { serializeForWrite } from './utils/propertyValue';

interface NewIcAlpsDealPanelProps {
  addAlert: (a: {
    type?: 'info' | 'warning' | 'success' | 'danger' | 'tip';
    message: string;
    title?: string;
  }) => void;
  closeOverlay: (id: string) => void;
  // Optional origin-record context for silent association on Save.
  // If both are present, the new deal is auto-linked to the originating
  // Contact or Company. If absent, the deal is created standalone.
  recordObjectId?: number | string;
  recordObjectTypeId?: string;
}

const PANEL_ID = 'new-icalps-deal-panel';

const isEmpty = (v: unknown): boolean =>
  v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

const NewIcAlpsDealPanel = ({
  addAlert,
  closeOverlay,
  recordObjectId,
  recordObjectTypeId,
}: NewIcAlpsDealPanelProps) => {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const handleFieldChange = (name: string) => (v: unknown) =>
    setValues((prev) => ({ ...prev, [name]: v }));

  const submit = async () => {
    // Validate required fields declared in the registry.
    const missing = EDITABLE_FIELDS.filter((f) => f.required && isEmpty(values[f.name]))
      .map((f) => f.label);
    if (missing.length > 0) {
      setErrors([`Missing required: ${missing.join(', ')}`]);
      return;
    }

    // Serialize every editable field; skip empty values.
    const properties: Record<string, string> = {};
    for (const f of EDITABLE_FIELDS) {
      const serialized = serializeForWrite(values[f.name], f.type);
      if (serialized !== null) properties[f.name] = serialized;
    }

    setSubmitting(true);
    setErrors([]);
    try {
      const associateTo =
        recordObjectId && recordObjectTypeId
          ? {
              objectId: String(recordObjectId),
              objectTypeId: recordObjectTypeId,
            }
          : undefined;

      const res = await hubspot.serverless('create_icalps_deal', {
        parameters: { properties, associateTo },
      });
      const payload =
        (res as { status?: string; id?: string | number; message?: string; detail?: string }) ?? {};
      if (payload.status === 'SUCCESS') {
        addAlert({
          type: 'success',
          message: `IcAlps deal created (id ${String(payload.id ?? '?')}).`,
        });
        setValues({});
        closeOverlay(PANEL_ID);
      } else {
        setErrors([payload.message ?? 'Create failed.', payload.detail ?? ''].filter(Boolean));
      }
    } catch (err) {
      setErrors([(err as Error)?.message ?? 'Unexpected error.']);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Panel
      id={PANEL_ID}
      title="Create IcAlps deal"
      width="md"
      variant="modal"
    >
      <PanelBody>
        <Flex direction="column" gap="md">
          {errors.length > 0 && (
            <Alert title="Create failed" variant="error">
              {errors.map((e, i) => (
                <Text key={i}>{e}</Text>
              ))}
            </Alert>
          )}

          {DEAL_GROUPS.map((group) => {
            const editable = group.fields.filter((f) => f.editable);
            if (editable.length === 0) return null;
            return (
              <Flex key={group.key} direction="column" gap="sm">
                <Text format={{ fontWeight: 'bold' }}>{group.label}</Text>
                {editable.map((f) => (
                  <FieldRenderer
                    key={f.name}
                    field={f}
                    value={values[f.name]}
                    onChange={handleFieldChange(f.name)}
                  />
                ))}
              </Flex>
            );
          })}

          <Text variant="microcopy">
            Pipeline and stage are preset to Icalps_hardware / Identified.
            The new deal will be silently associated with this record.
          </Text>
        </Flex>
      </PanelBody>
      <PanelFooter>
        <Flex direction="row" gap="sm" align="center">
          {submitting && <LoadingSpinner label="Creating…" size="xs" />}
          <Button variant="primary" onClick={submit} disabled={submitting}>
            {submitting ? 'Creating…' : 'Create'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => closeOverlay(PANEL_ID)}
            disabled={submitting}
          >
            Cancel
          </Button>
        </Flex>
      </PanelFooter>
    </Panel>
  );
};

export default NewIcAlpsDealPanel;
