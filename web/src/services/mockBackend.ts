import { baseDiscoverProfiles } from '../data/mockData';
import { DiscoverProfile } from '../types/models';

const MOCK_NETWORK_DELAY = 280;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export interface BackendAPI {
  fetchDiscoverProfiles(): Promise<DiscoverProfile[]>;
}

class MockBackendAPI implements BackendAPI {
  async fetchDiscoverProfiles(): Promise<DiscoverProfile[]> {
    await wait(MOCK_NETWORK_DELAY);
    return structuredClone(baseDiscoverProfiles);
  }

}

export const backendApi: BackendAPI = new MockBackendAPI();
