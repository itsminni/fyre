import { baseDiscoverProfiles, createMockThreads } from '../data/mockData';
import { ChatThread, DiscoverProfile } from '../types/models';

const MOCK_NETWORK_DELAY = 280;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export interface BackendAPI {
  fetchDiscoverProfiles(): Promise<DiscoverProfile[]>;
  fetchThreads(): Promise<ChatThread[]>;
}

class MockBackendAPI implements BackendAPI {
  async fetchDiscoverProfiles(): Promise<DiscoverProfile[]> {
    await wait(MOCK_NETWORK_DELAY);
    return structuredClone(baseDiscoverProfiles);
  }

  async fetchThreads(): Promise<ChatThread[]> {
    await wait(MOCK_NETWORK_DELAY);
    return createMockThreads();
  }
}

// TODO(backend): replace this with a real API client once backend endpoints are available.
export const backendApi: BackendAPI = new MockBackendAPI();
