import type { FeatureManifest } from '../../core/feature'

export default {
  id: 'search',
  order: 160,
  load: 'deferred',
  contracts: ['sidebar.new-session'],
  pref: 'sidebarSearch',
  stylesheets: [{ file: 'search.css', rank: 130 }],
  switchRow: {
    tab: 'sidebar',
    rank: 20,
    title: { key: 'searchTitle', fallback: 'Sidebar search' },
    desc: { key: 'searchDesc', fallback: 'A fixed Search button below New Session that finds sessions, projects, plugins, Skills and shortcuts. Off restores the host sidebar search.' },
  },
  cases: ['search', 'switches'],
  description: {
    zh: {
      title: '侧栏搜索',
      text: '固定搜索入口位于新会话下方，点击后通过宿主对话框搜索会话（标题与内容）、项目、插件、Skill 与快捷键；Ctrl+K 同样打开搜索面板。',
    },
    en: {
      title: 'Sidebar search',
      text: 'A fixed Search action below New Session opens the host dialog to find sessions (titles and content), projects, plugins, Skills and shortcuts; Ctrl+K opens the same palette.',
    },
  },
} satisfies FeatureManifest
