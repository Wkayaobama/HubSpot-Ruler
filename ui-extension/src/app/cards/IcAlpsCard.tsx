import { useCallback, useEffect, useState } from 'react';
import {
  hubspot,
  Flex,
  Heading,
  Text,
  Button,
  LoadingSpinner,
  Alert,
} from '@hubspot/ui-extensions';
import { ALL_PROPERTY_KEYS } from './icalpsPropertyConfig';
import EditStatusPanel from './EditStatusPanel';

type Ctx = {
  crm?: { objectId?: number | string; objectTypeId?: string };
  portal?: { id?: number | string };
};

type Actions = {
  fetchCrmObjectProperties: (names: string[] | '*') => Promise<Record<string, string>>;
  refreshObjectProperties?: () => void;
  addAlert: (a: {
    type?: 'info' | 'warning' | 'success' | 'danger' | 'tip';
    message: string;
    title?: string;
  }) => void;
  closeOverlay: (id: string) => void;
};

hubspot.extend<'crm.record.tab'>(({ context, actions }) => (
  <IcAlpsCard context={context as Ctx} actions={actions as Actions} />
));

// Minimal card: preload the current IcAlps property values so the Edit
// panel can open pre-filled, then expose a single Edit button. The
// read-only grid view was removed — HubSpot's native right sidebar
// already surfaces property values; this card's only differentiator
// is the edit-all-IcAlps-properties-in-one-panel affordance.
const IcAlpsCard = ({ context, actions }: { context: Ctx; actions: Actions }) => {
  const dealId = context?.crm?.objectId;
  const [propsMap, setPropsMap] = useState<Record<string, string> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setPropsMap(null);
    setLoadError(null);
    actions
      .fetchCrmObjectProperties(ALL_PROPERTY_KEYS)
      .then((r) => setPropsMap(r ?? {}))
      .catch((e: Error) =>
        setLoadError(e?.message ?? 'Failed to load IcAlps properties.'),
      );
  }, [actions]);

  useEffect(() => {
    reload();
  }, [reload]);

  if (loadError) {
    return (
      <Alert title="Load error" variant="error">
        <Text>{loadError}</Text>
      </Alert>
    );
  }

  if (!propsMap) {
    return <LoadingSpinner label="Loading IcAlps properties…" />;
  }

  return (
    <Flex direction="column" gap="sm">
      <Heading>IcAlps Deal View</Heading>
      <Text variant="microcopy">
        Edit the IcAlps-namespaced properties for this deal in a single panel.
      </Text>
      <Flex direction="row" gap="sm">
        <Button
          variant="primary"
          overlay={
            <EditStatusPanel
              dealId={dealId}
              initialValues={propsMap}
              onSaved={reload}
              addAlert={actions.addAlert}
              closeOverlay={actions.closeOverlay}
            />
          }
        >
          Edit
        </Button>
      </Flex>
    </Flex>
  );
};

export default IcAlpsCard;
