import Store from 'electron-store';

interface StoreSchema {
  serverAddress: string;
}

const store = new Store<StoreSchema>({
  defaults: {
    serverAddress: '',
  },
});

export function getServerAddress(): string {
  return store.get('serverAddress');
}

export function setServerAddress(address: string): void {
  store.set('serverAddress', address.trim().replace(/\/+$/, ''));
}
