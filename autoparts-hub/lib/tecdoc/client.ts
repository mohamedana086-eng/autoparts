/**
 * Talking to the TecDoc Catalogue web service.
 * -------------------------------------------
 * A thin client over the `pegasus-3-0` JSON endpoint: one POST per call,
 * the function name as the single top-level key, credentials merged into
 * every request.
 *
 *   const client = tecDocFromEnv();
 *   const page = await client.call<TecDocArticlesResponse>('getArticles', {...});
 *
 * Transport is an interface on purpose. `HttpTransport` is the real thing;
 * `FixtureTransport` replays a JSON file so the import job — the mapping,
 * the upserts, the report — can be exercised end to end without
 * credentials and without touching the network. That matters here because
 * the catalogue is a paid subscription: nobody should need one to check
 * that a change to the importer still works.
 */
import { readFileSync } from 'node:fs';

import type { TecDocEnvelope } from './types';

export interface TecDocConfig {
  endpoint: string;
  apiKey: string;
  /** TecAlliance customer/provider number. Sent as `provider` on every call. */
  providerId: number;
  /** Descriptions come back in this language. */
  lang: string;
  /**
   * Country determines which articles are on offer at all — TecDoc filters
   * the catalogue by market, so getting this wrong silently returns a
   * smaller catalogue rather than an error.
   */
  country: string;
}

export interface Transport {
  call(fn: string, params: Record<string, unknown>): Promise<unknown>;
}

export class TecDocError extends Error {
  constructor(
    message: string,
    readonly fn: string,
    readonly status?: number
  ) {
    super(message);
    this.name = 'TecDocError';
  }
}

/** Calls that failed this way are worth trying again. */
const RETRYABLE_HTTP = new Set([408, 429, 500, 502, 503, 504]);

const MAX_ATTEMPTS = 4;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class HttpTransport implements Transport {
  constructor(
    private readonly config: TecDocConfig,
    /** Requests per second. TecAlliance throttles per subscription; staying
     *  under the limit is cheaper than handling the 429s it answers with. */
    private readonly ratePerSecond = 5
  ) {}

  private lastCallAt = 0;

  private async throttle(): Promise<void> {
    const minGap = 1000 / this.ratePerSecond;
    const wait = this.lastCallAt + minGap - Date.now();
    if (wait > 0) await sleep(wait);
    this.lastCallAt = Date.now();
  }

  async call(fn: string, params: Record<string, unknown>): Promise<unknown> {
    const body = JSON.stringify({
      [fn]: {
        provider: this.config.providerId,
        lang: this.config.lang,
        country: this.config.country,
        articleCountry: this.config.country,
        ...params,
      },
    });

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      await this.throttle();

      let response: Response;
      try {
        response = await fetch(this.config.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': this.config.apiKey,
          },
          body,
        });
      } catch (cause) {
        // A dropped connection is worth retrying; anything else is not.
        lastError = cause instanceof Error ? cause : new Error(String(cause));
        if (attempt === MAX_ATTEMPTS) break;
        await sleep(2 ** attempt * 250);
        continue;
      }

      if (!response.ok) {
        if (RETRYABLE_HTTP.has(response.status) && attempt < MAX_ATTEMPTS) {
          await sleep(2 ** attempt * 250);
          continue;
        }
        throw new TecDocError(
          `${fn} failed: HTTP ${response.status} ${response.statusText}`,
          fn,
          response.status
        );
      }

      const payload = (await response.json()) as TecDocEnvelope;

      // The endpoint answers 200 at the HTTP layer even for rejected calls,
      // putting the real outcome in the envelope. An unauthorised key looks
      // exactly like an empty catalogue unless this is checked.
      if (typeof payload.status === 'number' && payload.status !== 200) {
        throw new TecDocError(
          `${fn} rejected: status ${payload.status}${
            payload.statusText ? ` (${payload.statusText})` : ''
          }`,
          fn,
          payload.status
        );
      }

      return payload;
    }

    throw new TecDocError(
      `${fn} failed after ${MAX_ATTEMPTS} attempts: ${lastError?.message ?? 'unknown error'}`,
      fn
    );
  }
}

function isArticleEnvelope(
  value: unknown
): value is { articles: Array<{ brandNo?: number }> } {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { articles?: unknown }).articles)
  );
}

/**
 * Replays canned responses from a JSON file whose top-level keys are
 * function names. Missing keys answer empty rather than throwing, so a
 * fixture only needs to cover the calls a given run actually makes.
 */
export class FixtureTransport implements Transport {
  private readonly data: Record<string, unknown>;

  constructor(fixturePath: string) {
    this.data = JSON.parse(readFileSync(fixturePath, 'utf8')) as Record<string, unknown>;
  }

  async call(fn: string, params: Record<string, unknown>): Promise<unknown> {
    const canned = this.data[fn];
    if (canned === undefined) return { status: 200 };

    // Paged calls ask for page 2 and beyond; the fixture holds one page, so
    // answer empty after the first to terminate the loop the same way the
    // real service does.
    const page = typeof params.page === 'number' ? params.page : 1;
    if (page > 1) return { status: 200 };

    // The live service returns only the requested brand's articles. Without
    // honouring that here, a fixture holding two brands would hand its whole
    // article list back once per brand and the import would count everything
    // twice.
    if (typeof params.brandNo === 'number' && isArticleEnvelope(canned)) {
      return {
        ...canned,
        articles: canned.articles.filter((a) => a.brandNo === params.brandNo),
      };
    }

    return canned;
  }
}

export class TecDocClient {
  constructor(private readonly transport: Transport) {}

  call<T>(fn: string, params: Record<string, unknown> = {}): Promise<T> {
    return this.transport.call(fn, params) as Promise<T>;
  }

  /**
   * Walks a paged call, handing back each page's rows until one comes back
   * short. `pick` pulls the array out of the envelope, whose key differs
   * per function.
   */
  async *paged<T>(
    fn: string,
    params: Record<string, unknown>,
    pick: (page: unknown) => T[] | undefined,
    perPage = 100
  ): AsyncGenerator<T[]> {
    for (let page = 1; ; page++) {
      const envelope = await this.call<unknown>(fn, { ...params, page, perPage });
      const rows = pick(envelope) ?? [];
      if (rows.length === 0) return;
      yield rows;
      if (rows.length < perPage) return;
    }
  }
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. The TecDoc import needs TECDOC_API_KEY and ` +
        `TECDOC_PROVIDER_ID from your TecAlliance subscription — or run with ` +
        `--fixture to work offline.`
    );
  }
  return value;
}

export function tecDocConfigFromEnv(): TecDocConfig {
  const providerId = Number(required('TECDOC_PROVIDER_ID'));
  if (!Number.isInteger(providerId)) {
    throw new Error('TECDOC_PROVIDER_ID must be the numeric customer id.');
  }

  return {
    endpoint:
      process.env.TECDOC_ENDPOINT ??
      'https://webservice.tecalliance.services/pegasus-3-0/services/TecdocToCatDLB.jsonEndpoint',
    apiKey: required('TECDOC_API_KEY'),
    providerId,
    lang: process.env.TECDOC_LANG ?? 'en',
    country: process.env.TECDOC_COUNTRY ?? 'DE',
  };
}

/** The live client, configured from the environment. */
export function tecDocFromEnv(): TecDocClient {
  return new TecDocClient(new HttpTransport(tecDocConfigFromEnv()));
}

/** The offline client, replaying a fixture file. */
export function tecDocFromFixture(path: string): TecDocClient {
  return new TecDocClient(new FixtureTransport(path));
}
