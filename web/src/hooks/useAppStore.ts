import { useAppStoreContext } from '../context/AppContext';

export function useAppStore() {
  return useAppStoreContext();
}
