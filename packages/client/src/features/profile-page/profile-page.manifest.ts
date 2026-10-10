import type { FeatureManifest } from '../../core/feature'

export default {
  id: 'profile',
  order: 115,
  contracts: [],
  ungated: '个人活动页从侧栏账号行打开',
  stylesheets: [
    { file: 'profile-page.css', rank: 250 },
    { file: 'profile-usage.css', rank: 251 },
  ],
  cases: ['account', 'desktop'],
  description: {
    zh: {
      title: '个人活动页',
      text: '在侧栏账号行打开 All/30d/7d 个人活动页，查看 52 周 Token 热图、streak 与模型 Token 卡片；模型统计位于 Workspace 数据上方。模型和 Workspace 区默认各展示最多六张卡片，并可从右侧展开或收起全部。Workspace 卡片可查看 Token 分桶与主要模型；Skill 调用在下方以水平堆叠条形图排序显示，区分显式注入与模型工具调用，并保留数量、会话和 Workspace 元数据。日志或 registry 不可用时会说明原因。',
    },
    en: {
      title: 'Personal activity',
      text: 'Open the All/30d/7d activity page from the sidebar account row: view a 52-week Token heatmap, streaks and model Token cards, with model statistics above Workspace data. Model and Workspace sections preview up to six cards and offer a right-aligned expand/collapse control. Workspace cards reveal Token buckets and top models; Skill activity below is a ranked horizontal stacked-bar chart that separates explicit injections from model tool calls and shows counts, sessions and Workspaces. Unreadable logs and registry state are disclosed.',
    },
  },
} satisfies FeatureManifest
