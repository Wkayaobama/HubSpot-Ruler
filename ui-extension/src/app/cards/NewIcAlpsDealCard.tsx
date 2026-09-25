import {
  hubspot,
  Flex,
  Heading,
  Text,
  Button,
} from '@hubspot/ui-extensions';
import NewIcAlpsDealPanel from './NewIcAlpsDealPanel';

type Ctx = {
  crm?: { objectId?: number | string; objectTypeId?: string };
};

type Actions = {
  addAlert: (a: {
    type?: 'info' | 'warning' | 'success' | 'danger' | 'tip';
    message: string;
    title?: string;
  }) => void;
  closeOverlay: (id: string) => void;
};

hubspot.extend<'crm.record.tab'>(({ context, actions }) => (
  <NewIcAlpsDealCard
    context={context as Ctx}
    actions={actions as Actions}
  />
));

const NewIcAlpsDealCard = ({
  context,
  actions,
}: {
  context: Ctx;
  actions: Actions;
}) => {
  const recordObjectId = context?.crm?.objectId;
  const recordObjectTypeId = context?.crm?.objectTypeId;

  return (
    <Flex direction="column" gap="md">
      <Heading>IcAlps deal — quick create</Heading>
      <Text variant="microcopy">
        Open the form to create a new IcAlps deal with the full namespaced
        property set. Pipeline defaults to Icalps_hardware, stage to Identified.
        The new deal will be silently associated with this record.
      </Text>
      <Flex direction="row" gap="sm">
        <Button
          variant="primary"
          overlay={
            <NewIcAlpsDealPanel
              addAlert={actions.addAlert}
              closeOverlay={actions.closeOverlay}
              recordObjectId={recordObjectId}
              recordObjectTypeId={recordObjectTypeId}
            />
          }
        >
          Create IcAlps deal
        </Button>
      </Flex>
    </Flex>
  );
};

export default NewIcAlpsDealCard;
