import {
  hubspot,
  Flex,
  Heading,
  Text,
  Button,
} from '@hubspot/ui-extensions';
import NewIcAlpsContactPanel from './NewIcAlpsContactPanel';

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
  <NewIcAlpsContactCard
    context={context as Ctx}
    actions={actions as Actions}
  />
));

const NewIcAlpsContactCard = ({
  context,
  actions,
}: {
  context: Ctx;
  actions: Actions;
}) => {
  const recordObjectId = context?.crm?.objectId;
  const recordObjectTypeId = context?.crm?.objectTypeId;

  return (
    <Flex direction="column" gap="sm">
      <Heading>IcAlps contact — quick create</Heading>
      <Text variant="microcopy">
        Create a new contact and silently link it to this company.
      </Text>
      <Flex direction="row" gap="sm">
        <Button
          variant="primary"
          overlay={
            <NewIcAlpsContactPanel
              addAlert={actions.addAlert}
              closeOverlay={actions.closeOverlay}
              recordObjectId={recordObjectId}
              recordObjectTypeId={recordObjectTypeId}
            />
          }
        >
          Create contact
        </Button>
      </Flex>
    </Flex>
  );
};

export default NewIcAlpsContactCard;
