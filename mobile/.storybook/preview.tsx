import type { Preview } from '@storybook/react-native-web-vite';
import React from 'react';

import {
  StorybookPreviewFrame,
  storybookBackgrounds,
} from '@/ui/storybook/StorybookPreviewFrame';

const preview: Preview = {
  decorators: [
    (Story) => (
      <StorybookPreviewFrame>
        <Story />
      </StorybookPreviewFrame>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
    backgrounds: storybookBackgrounds,
    options: {
      storySort: {
        order: ['Foundations', 'Primitives', 'Composites', 'Brand Stress'],
      },
    },
  },
};

export default preview;
