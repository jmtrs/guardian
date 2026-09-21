import { Redirect } from 'expo-router';

export default function StorybookRoute() {
  if (process.env.EXPO_PUBLIC_STORYBOOK_ENABLED !== 'true') {
    return <Redirect href="/" />;
  }

  // Storybook native is bundled conditionally via Metro when the env flag is enabled.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const StorybookUIRoot = require('../../.rnstorybook')
    .default as React.ComponentType;

  return <StorybookUIRoot />;
}
