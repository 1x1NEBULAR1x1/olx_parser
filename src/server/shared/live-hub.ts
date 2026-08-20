import { EventEmitter } from "node:events";

const SCAN_EVENT = "scan";
const hub = new EventEmitter();
hub.setMaxListeners(200);

export function publishScanUpdate(): void {
  hub.emit(SCAN_EVENT);
}

export function subscribeScanUpdate(listener: () => void): () => void {
  hub.on(SCAN_EVENT, listener);
  return () => {
    hub.off(SCAN_EVENT, listener);
  };
}

export function publishNotificationUpdate(user_id: string): void {
  hub.emit(`notify:${user_id}`);
}

export function subscribeNotificationUpdate(user_id: string, listener: () => void): () => void {
  const event_name = `notify:${user_id}`;
  hub.on(event_name, listener);
  return () => {
    hub.off(event_name, listener);
  };
}

const CATALOG_EVENT = "catalog";

export function publishCatalogUpdate(): void {
  hub.emit(CATALOG_EVENT);
}

export function subscribeCatalogUpdate(listener: () => void): () => void {
  hub.on(CATALOG_EVENT, listener);
  return () => {
    hub.off(CATALOG_EVENT, listener);
  };
}
