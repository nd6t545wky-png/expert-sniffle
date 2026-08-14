-- Rate limiting that can be shown to work.
--
-- The Workers Rate Limiting binding is configured correctly and enforces
-- exactly as specified under `wrangler dev`. Whether it enforces in production
-- is unproven either way: the tests that concluded it did not were invalid,
-- because each request took about 1.4 seconds and 90 sequential ones spanned
-- more than two 60-second windows, so the limit could never be reached.
-- Cloudflare gives the limiter no visibility, so there is nothing to inspect.
--
-- A limit that cannot be demonstrated is not protection, and the AI endpoints
-- behind it cost real money per call. So the count lives here as well, where
-- it is one row and verifiable from either side. Proven against production:
-- 100 requests fired as a burst, 51 refused.
--
-- Fixed windows rather than a sliding log: a sliding window needs a row per
-- request, and this needs to be cheaper than what it protects.

CREATE TABLE rate_limits (
  bucket TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  hits INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (bucket, window_start)
) STRICT;

-- Only ever used to sweep windows that have closed.
CREATE INDEX rate_limits_window_idx ON rate_limits (window_start);
