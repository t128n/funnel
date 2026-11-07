import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://t128n.github.io',
  base: '/funnel',
  integrations: [starlight({
    title: 'Funnel',
    social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/t128n/funnel' }],
    sidebar: [
      { label: 'Tutorials', collapsed: true, items: [{ autogenerate: { directory: 'tutorials' } }] },
      { label: 'User guides', collapsed: true, items: [{ autogenerate: { directory: 'how-to/use' } }] },
      { label: 'Deploy', collapsed: true, items: [{ autogenerate: { directory: 'how-to/deploy' } }] },
      { label: 'Configure', collapsed: true, items: [{ autogenerate: { directory: 'how-to/configure' } }] },
      { label: 'Operate', collapsed: true, items: [{ autogenerate: { directory: 'how-to/operate' } }] },
      { label: 'Integrate', collapsed: true, items: [{ autogenerate: { directory: 'how-to/integrate' } }] },
      { label: 'Reference', collapsed: true, items: [{ autogenerate: { directory: 'reference' } }] },
      { label: 'Explanation', collapsed: true, items: [{ autogenerate: { directory: 'explanation' } }] },
      { label: 'Contribute', collapsed: true, items: [{ autogenerate: { directory: 'how-to/contribute' } }] },
    ],
  })],
});
