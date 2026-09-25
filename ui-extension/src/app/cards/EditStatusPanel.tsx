import { useEffect, useState } from 'react';
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
import { DEAL_GROUPS, EDITABLE_FIELDS, PROP_TYPE } from './icalpsPropertyConfig';
import FieldRenderer from './FieldRenderer';
import {
  serializeForWrite,
  changed,
  type BaseDate,
} from './utils/propertyValue';

interface EditStatusPanelProps {
  dealId: number | string | undefined;
  initialValues: Record<string, string>;
  onSaved: () => void;
  addAlert: (a: { type?: 'info' | 'warning' | 'success' | 'danger' | 'tip'; message: string; title?: string }) => void;
  closeOverlay: (id: string) => void;
}

const PANEL_ID = 'edit-status-panel';

const EditStatusPanel = ({
  dealId,
  initialValues,
  onSaved,
  addAlert,
  closeOverlay,
}: EditStatusPanelProps) => {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    const seed: Record<string, unknown> = {};
    for (const f of EDITABLE_FIELDS) {
      const raw = initialValues?.[f.name];
      if (f.type === PROP_TYPE.DATE) {
        seed[f.name] =
          raw === null || raw === undefined || raw === ''
            ? undefined
            : ((): BaseDate | undefined => {
                const n = Number(raw);
                if (!Number.isFinite(n)) return undefined;
                const d = new Date(n);
                return {
                  year: d.getUTCFullYear(),
                  month: d.getUTCMonth(),
                  date: d.getUTCDate(),
                };
              })();
      } else if (f.type === PROP_TYPE.NUMBER) {
        seed[f.name] = raw === '' || raw === null || raw === undefined ? undefined : Number(raw);
      } else {
        seed[f.name] = raw ?? '';
      }
    }
    setValues(seed);
    setErrors([]);
  }, [initialValues]);

  const handleFieldChange = (name: string) => (v: unknown) =>
    setValues((prev) => ({ ...prev, [name]: v }));

  const submit = async () => {
    if (!dealId) {
      addAlert({ type: 'danger', message: 'No deal in context.' });
      return;
    }

    // Build diff of only-changed fields, serialized for HubSpot API.
    const diff: Record<string, string | null> = {};
    for (const f of EDITABLE_FIELDS) {
      const next = serializeForWrite(values[f.name], f.type);
      const prev = serializeForWrite(
        f.type === PROP_TYPE.DATE
          ? ((): BaseDate | undefined => {
              const raw = initialValues?.[f.name];
              if (raw === null || raw === undefined || raw === '') return undefined;
              const n = Number(raw);
              if (!Number.isFinite(n)) return undefined;
              const d = new Date(n);
              return {
                year: d.getUTCFullYear(),
                month: d.getUTCMonth(),
                date: d.getUTCDate(),
              };
            })()
          : initialValues?.[f.name] ?? '',
        f.type,
      );
      if (changed(next, prev)) {
        diff[f.name] = next;
      }
    }

    if (Object.keys(diff).length === 0) {
      addAlert({ type: 'info', message: 'No changes to save.' });
      return;
    }

    setSubmitting(true);
    setErrors([]);
    try {
      const res = await hubspot.serverless('update_deal_properties', {
        parameters: { dealId: String(dealId), properties: diff },
      });
      const payload = (res as { status?: string; message?: string; detail?: string }) ?? {};
      if (payload.status === 'SUCCESS') {
        addAlert({
          type: 'success',
          message: `Updated ${Object.keys(diff).length} field(s).`,
        });
        onSaved();
        closeOverlay(PANEL_ID);
      } else {
        setErrors([payload.message ?? 'Save failed.', payload.detail ?? ''].filter(Boolean));
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
      title="Edit IcAlps deal properties"
      width="md"
      variant="modal"
    >
      <PanelBody>
        <Flex direction="column" gap="md">
          {errors.length > 0 && (
            <Alert title="Save failed" variant="error">
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
        </Flex>
      </PanelBody>
      <PanelFooter>
        <Flex direction="row" gap="sm" align="center">
          {submitting && <LoadingSpinner label="Saving\u2026" size="xs" />}
          <Button variant="primary" onClick={submit} disabled={submitting}>
            {submitting ? 'Saving\u2026' : 'Save'}
          </Button>
          <Button variant="secondary" onClick={() => closeOverlay(PANEL_ID)} disabled={submitting}>
            Cancel
          </Button>
        </Flex>
      </PanelFooter>
    </Panel>
  );
};

export default EditStatusPanel;
