import type { ComponentType, MutableRefObject } from "react";

export type SiteLanguage = "en" | "zh";

export type SiteAutomationController = {
  state: () => unknown;
  invoke: (action: string, payload?: unknown) => unknown | Promise<unknown>;
};

export type SiteHomeProps = {
  brandName: string;
  brandMark: string;
  brandTagline: string;
  language: SiteLanguage;
  setLanguage: (language: SiteLanguage) => Promise<void>;
  automationRef: MutableRefObject<SiteAutomationController | null>;
};

export type SiteDocumentTitleContext = {
  brandName: string;
  view: string;
  activeType: string;
  object: {
    id: string;
    type_id: string;
    title: string;
  } | null;
};

export type MemexSiteExtension = {
  id: string;
  HomePage?: ComponentType<SiteHomeProps>;
  documentTitle?: (context: SiteDocumentTitleContext) => string;
};
