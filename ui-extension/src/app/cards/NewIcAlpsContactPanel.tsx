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
import {
  CONTACT_GROUPS,
  EDITABLE_CONTACT_FIELDS,
} from './contactIcalpsPropertyConfig';
import FieldRenderer from './FieldRenderer';
import { serializeForWrite } from './utils/propertyValue';

interface NewIcAlpsContactPanelProps {
  addAlert: (a: {
    type?: 'info' | 'warning' | 'success' | 'danger' | 'tip';
    message: string;
    title?: string;
  }) => void;
  closeOverlay: (id: string) => void;
  // When present, the new Contact is silently associated to the
  // originating Company via contact_to_company HUBSPOT_DEFINED typeId 1.
  recordObjectId?: number | string;
  recordObjectTypeId?: string;
}

const PANEL_ID = 'new-icalps-contact-panel';

const isEmpty = (v: unknown): boolean =>
  v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

const NewIcAlpsContactPanel = ({
  addAlert,
  closeOverlay,
  recordObjectId,
  recordObjectTypeId,
}: NewIcAlpsContactPanelProps) => {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const handleFieldChange = (name: string) => (v: unknown) =>
    setValues((prev) => ({ ...prev, [name]: v }));

  const submit = async () => {
    const missing = EDITABLE_CONTACT_FIELDS.filter(
      (f) => f.required && isEmpty(values[f.name]),
    ).map((f) => f.label);
    if (missing.length > 0) {
      setErrors([`Missing required: ${missing.join(', ')}`]);
      return;
    }

    const properties: Record<string, string> = {};
    for (const f of EDITABLE_CONTACT_FIELDS) {
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

      const res = await hubspot.serverless('create_icalps_contact', {
        parameters: { properties, associateTo },
      });
      const payload =
        (res as { status?: string; id?: string | number; message?: string; detail?: string }) ?? {};
      if (payload.status === 'SUCCESS') {
        addAlert({
          type: 'success',
          message: `IcAlps contact created (id ${String(payload.id ?? '?')}).`,
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
      title="Create IcAlps contact"
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

          {CONTACT_GROUPS.map((group) => {
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
            The new contact will be silently associated with this company.
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

export default NewIcAlpsContactPanel;
