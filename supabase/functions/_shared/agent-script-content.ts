// This module exports agent script content as TypeScript strings
// so they can be accessed by Edge Functions at runtime in Lovable Cloud
// (non-TS files are not bundled for deployment)

// To regenerate: read the .ps1/.sh files and paste content here as template literals
// Only include the ACTIVE version that needs syncing

export const SCRIPT_VERSION = 'v5.0.13';

// Script content will be loaded dynamically from the sync endpoint
// Since embedding 100KB+ scripts in TS is impractical,
// we use a chunked approach via the sync-agent-release-content endpoint
