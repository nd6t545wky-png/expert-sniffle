# Recovered build — not source

These files are **build output fetched from production**, not source code. They
are kept here because they were, for a while, the only copy of work that exists
nowhere in this repository.

## What happened

Production is a single Cloudflare Worker, `dylan-pitching-os`. Anyone with the
account can deploy to it and the last deploy wins, with no error and no notice.

On 13 August 2026 a different codebase was deployed over this one, seven times.
On 14 August this repository was deployed back over that, which is what restored
the app the athlete expected — and removed the other one.

That other build is tagged `v=61` and ships a file this repository has never
had: `domain.js`. Inside it is a throwing-recovery feature set that does not
exist here in any form, in any commit, on any branch:

    buildThrowingRecoveryPlan        classifyThrowingLoadTier
    buildGymRecoveryPlan             protocolLengthForTier
    calculateProvisionalThrowingLoad coldPolicy
    isPosteriorStretchBlocked        postScapularRangeAnnotation
    evaluateSafety                   canOverrideReadiness

Read out of the minified bundle, it is a five-day post-throwing recovery
protocol: load tiers of light / moderate / heavy classified from game pitches,
total throws and intent; protocol lengths of 5, 4 and 2 days by tier; a
`throwing-recovery-no-cold-v2` policy; and compression, heat, percussive,
mobility-cooldown, fuel and sleep modalities.

## Why these files are here

They were archived from the live site before it was redeployed. Cloudflare's
version history also holds that deployment, and is the authoritative copy:

    npx wrangler rollback fae3dc38-5c4d-4bfe-b0ec-2b0629cd6860

But stored versions age out, and this was the only other copy in existence —
sitting in a scratch directory that disappears when the container is reclaimed.
768 KB of minified JavaScript is a cheap price for not losing a feature.

## What these files are **not**

Not source. Not something to deploy. Not something to import from. They are
minified output, and the training prescriptions inside them are compressed
string literals. Reconstructing the feature by reading them would mean inferring
an athlete's protocol from a bundle, and getting a dose wrong that way is worse
than not having the feature.

The real fix is the original source. If it is in another repository or branch,
that is what should be merged — and this directory deleted the moment it is.
