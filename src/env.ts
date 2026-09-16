export interface Env {
  // Static assets (public/ built to dist/, see wrangler.jsonc)
  ASSETS: Fetcher;

  // Storage
  SYNC_DB: D1Database;
  PRIVATE_MEDIA: R2Bucket;

  // Cloudflare AI / Images
  AI: Ai;
  IMAGES: ImagesBinding;

  // Native Workers Rate Limiting bindings
  AI_RATE_LIMITER: RateLimit;
  INTEGRATION_RATE_LIMITER: RateLimit;
  INGEST_RATE_LIMITER: RateLimit;

  // Config
  APP_ORIGIN: string;

  // Secrets — set with `wrangler secret put <NAME>`, never commit values
  BETTER_AUTH_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  OURA_CLIENT_ID: string;
  OURA_CLIENT_SECRET: string;
  HEALTH_TOKEN_KEY: string;
  // USDA FoodData Central. Rate-limiting rather than access control -- it gates
  // 1000 requests/hour, not private data -- but it is still not ours to publish,
  // and keeping it here means the browser never carries it.
  USDA_API_KEY: string;
  WORKSPACE_MASTER_KEY: string;
}
