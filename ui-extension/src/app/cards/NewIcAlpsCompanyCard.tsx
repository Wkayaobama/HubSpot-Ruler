import {
  hubspot,
  Flex,
  Heading,
  Text,
  Button,
} from '@hubspot/ui-extensions';
import NewIcAlpsCompanyPanel from './NewIcAlpsCompanyPanel';

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
  <NewIcAlpsCompanyCard
    context={context as Ctx}
    actions={actions as Actions}
  />
));

const NewIcAlpsCompanyCard = ({
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
      <Heading>IcAlps company — quick create</Heading>
      <Text variant="microcopy">
        Create a new company and silently link it to this contact.
      </Text>
      <Flex direction="row" gap="sm">
        <Button
          variant="primary"
          overlay={
            <NewIcAlpsCompanyPanel
              addAlert={actions.addAlert}
              closeOverlay={actions.closeOverlay}
              recordObjectId={recordObjectId}
              recordObjectTypeId={recordObjectTypeId}
            />
          }
        >
          Create company
        </Button>
      </Flex>
    </Flex>
  );
};

export default NewIcAlpsCompanyCard;
