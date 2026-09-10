import base from "../../../vitest.config";

// Preserve the default include/exclude while disabling .env loading.
const discoveryConfig = { ...base, envDir: false };

export default discoveryConfig;
