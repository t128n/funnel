import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { starlightPele } from 'starlight-pele';

export default defineConfig({
  site: 'https://t128n.github.io',
  base: '/funnel',
  integrations: [starlight({
    title: 'Funnel',
    disable404Route: true,
    expressiveCode: { shiki: { langAlias: { caddyfile: 'text' } } },
    plugins: [starlightPele()],
    social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/t128n/funnel' }],
    sidebar: [
      { label: 'For end users', items: [
        { label: 'Install Funnel', link: '/how-to/deploy/install/' },
        { label: 'Tutorials', collapsed: true, items: [{ autogenerate: { directory: 'tutorials' } }] },
        { label: 'User guides', collapsed: true, items: [{ autogenerate: { directory: 'how-to/use' } }] },
        { label: 'Deploy', collapsed: true, items: [{ autogenerate: { directory: 'how-to/deploy' } }] },
        { label: 'Configure', collapsed: true, items: [{ autogenerate: { directory: 'how-to/configure' } }] },
        { label: 'Operate', collapsed: true, items: [{ autogenerate: { directory: 'how-to/operate' } }] },
        { label: 'Integrate', collapsed: true, items: [{ autogenerate: { directory: 'how-to/integrate' } }] },
      ] },
      { label: 'For contributors', collapsed: true, items: [{ autogenerate: { directory: 'how-to/contribute' } }] },
      { label: 'Reference', collapsed: true, items: [{ autogenerate: { directory: 'reference' } }] },
      { label: 'Explanation', collapsed: true, items: [{ autogenerate: { directory: 'explanation' } }] },
    ],
  })],
});
