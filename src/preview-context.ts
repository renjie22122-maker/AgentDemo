import { createContext } from 'react';
export type PreviewInteraction = {
  zh?: boolean;
  sourceId?: string;
  onResult?: (text: string) => boolean | void;
};
export const PreviewContext = createContext<PreviewInteraction>({});
