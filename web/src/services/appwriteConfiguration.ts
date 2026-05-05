export interface AppwriteConfiguration {
  endpoint: string;
  projectId: string;
  databaseId: string;
  profilesTableId: string;
  avatarsBucketId: string;
  chatAttachmentsBucketId: string | null;
  eventsTableId: string;
  eventRegistrationsTableId: string;
  threadsTableId: string;
  threadParticipantsTableId: string;
  messagesTableId: string;
  swipesTableId: string | null;
  matchesTableId: string | null;
  relationshipsTableId: string | null;
  registerForEventFunctionId: string;
  cancelEventRegistrationFunctionId: string;
  eventAdminFunctionId: string | null;
  createOrGetThreadFunctionId: string;
  sendMessageFunctionId: string;
  recordSwipeFunctionId: string | null;
  discoverProfilesFunctionId: string | null;
  manageRelationshipFunctionId: string | null;
  createOrGetThreadFunctionDomain: string | null;
  sendMessageFunctionDomain: string | null;
  recordSwipeFunctionDomain: string | null;
  discoverProfilesFunctionDomain: string | null;
  eventAdminFunctionDomain: string | null;
}

const DEFAULT_APPWRITE_CONFIGURATION: AppwriteConfiguration = {
  endpoint: 'http://localhost/v1',
  projectId: 'fyre-development',
  databaseId: 'fyre',
  profilesTableId: 'profiles',
  avatarsBucketId: 'avatars',
  chatAttachmentsBucketId: 'chat-attachments',
  eventsTableId: 'events',
  eventRegistrationsTableId: 'eventregistrations',
  threadsTableId: 'threads',
  threadParticipantsTableId: 'threadparticipants',
  messagesTableId: 'messages',
  swipesTableId: 'swipe',
  matchesTableId: 'matches',
  relationshipsTableId: 'relationships',
  registerForEventFunctionId: 'registerforevent',
  cancelEventRegistrationFunctionId: 'canceleventregistration',
  eventAdminFunctionId: 'manageeventadmin',
  createOrGetThreadFunctionId: 'createorgetthread',
  sendMessageFunctionId: 'sendmessage',
  recordSwipeFunctionId: 'recordswipe',
  discoverProfilesFunctionId: 'discoverprofiles',
  manageRelationshipFunctionId: 'managerelationship',
  createOrGetThreadFunctionDomain: null,
  sendMessageFunctionDomain: null,
  recordSwipeFunctionDomain: null,
  discoverProfilesFunctionDomain: null,
  eventAdminFunctionDomain: null
};

export function loadAppwriteConfiguration(): AppwriteConfiguration {
  return { ...DEFAULT_APPWRITE_CONFIGURATION };
}
