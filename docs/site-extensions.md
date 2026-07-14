# Memex site extensions

Memex owns the reusable knowledge interface. A deployed knowledge product can own its homepage and editorial presentation without forking the Memex frontend.

## Build-time contract

Set `MEMEX_SITE_EXTENSION` to an absolute TSX module that default-exports a `MemexSiteExtension`:

```tsx
import type { MemexSiteExtension } from "@memex/site";
import { HomePage } from "./home/HomePage";

export default {
  id: "example-site",
  HomePage
} satisfies MemexSiteExtension;
```

The extension can import the supported surface from `@memex/site`, including shadcn primitives, Lucide icons, TanStack Query, and the extension types. It should not import private modules from `@/`.

Build variables:

| Variable | Purpose |
| --- | --- |
| `MEMEX_SITE_EXTENSION` | Absolute path to the extension module. |
| `MEMEX_SITE_CONTENT` | Tailwind content glob for external TS/TSX files. |
| `MEMEX_SITE_TITLE` | HTML title and Open Graph title. |
| `MEMEX_SITE_DESCRIPTION` | Description and Open Graph description. |
| `MEMEX_SITE_THEME_COLOR` | Browser theme color. |
| `MEMEX_WEB_OUT_DIR` | Output directory for the compiled UI. |

Without an extension, the local Memex build keeps the object browser at `/`.

## Runtime contract

The custom homepage receives brand and language state plus an automation ref. It can register product-specific actions without replacing `window.memex`:

```tsx
export function HomePage({ automationRef }: SiteHomeProps) {
  useEffect(() => {
    automationRef.current = {
      state: () => ({ page: "home" }),
      invoke: (action, payload) => ({ action, payload })
    };
    return () => {
      automationRef.current = null;
    };
  }, [automationRef]);

  return <main>...</main>;
}
```

Agents can inspect and operate it through:

```js
window.memex.state()
window.memex.site.state()
window.memex.site.invoke("setSearch", { query: "Kernel" })
window.memex.openHome()
```

The host product owns homepage content, assets, routes, and publication decisions. Memex continues to own object pages, tables, schema, graphs, Markdown rendering, and the local-first CLI/server.
