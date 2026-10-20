// @qdrant/js-client-rest as Mastra's vendored Qdrant suite sees it: the real client, with
// the Loams gateway's URL, an lk_ API key and the Loams-Namespace header merged into every
// QdrantClient the suite constructs. Everything else is the real module.
//
//   LOAMS_QDRANT_URL (or QDRANT_URL)       replaces the suite's http://localhost:6333/
//   LOAMS_API_KEY (or QDRANT_API_KEY)      sent as the api-key header
//   LOAMS_NAMESPACE                        sent as Loams-Namespace
import * as real from '@loams-internal/real-qdrant-client';

export * from '@loams-internal/real-qdrant-client';

type Params = ConstructorParameters<typeof real.QdrantClient>[0];

export function loamsParams(params: Params = {}): Params {
  const url = process.env.LOAMS_QDRANT_URL ?? process.env.QDRANT_URL;
  const apiKey = process.env.LOAMS_API_KEY ?? process.env.QDRANT_API_KEY;
  const namespace = process.env.LOAMS_NAMESPACE;
  return {
    ...params,
    ...(url ? { url, host: undefined, port: undefined } : {}),
    ...(apiKey ? { apiKey } : {}),
    ...(namespace ? { headers: { ...(params?.headers ?? {}), 'Loams-Namespace': namespace } } : {}),
  };
}

export class QdrantClient extends real.QdrantClient {
  constructor(params?: Params) {
    super(loamsParams(params));
  }
}
