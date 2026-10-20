# Sidebar entry for Mastra's docs

Add this object to `docs/src/content/en/integrations/sidebars.js`, in the **Databases**
category, in alphabetical order (after `databases/libsql`, before `databases/mongodb`; check the
neighbours at the commit the PR is based on):

```js
        {
          type: 'doc',
          id: 'databases/loams',
          label: 'Loams',
          customProps: { icon: 'https://loams.dev/icon.svg' },
        },
```

The icon is served by loams.dev (`https://loams.dev/icon.svg`, `image/svg+xml`, checked
2026-10-20). The page goes to `docs/src/content/en/integrations/databases/loams.mdx`, copied
from [`loams.mdx`](loams.mdx).
