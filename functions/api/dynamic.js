import { generateCatalogResponse } from '../lib/dynamic.js';

export async function onRequest(context) {
  return generateCatalogResponse(context);
}
