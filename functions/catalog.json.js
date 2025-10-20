import { generateCatalogResponse } from './lib/catalog.js';

export async function onRequest(context) {
  return generateCatalogResponse(context);
}
