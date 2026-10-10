# D56. 账号行打开真实的 Profile 活动页

- **状态**：已实施
- **分组**：功能
- **关联**：取代 D25；D42、D45、D53

## 决定

- 侧栏账号用户名行打开 `shell.overlay` 中的全屏 Profile 页面；打开前关闭 Host 或自建账号菜单，关闭后把焦点还给真实的侧栏账号入口。
- 页面提供 All、30d、7d 范围、52 周热力图、峰值日、当前/最长活跃 streak、模型排行，以及按 Workspace 与 Skill 展开的统计；范围汇总只接受截至本地今天的数据。
- 移除 `ban-screen` 彩蛋、`banLocale` 偏好和其虚构文案；不展示无法可靠聚合的任务耗时。

## 理由

- 用户需要的是自己的会话活动，而不是仿制账户暂停状态的装饰页面。
- 账号弹层与全屏页同时留在屏幕上会制造重复界面；用 additive overlay、关闭前一 surface 和 focus return 保持单一明确的交互路径。

## 代价

- 页面依赖 Host usage route 与 Session-list summary；缺少详细日数据时必须说明正在计算、不可用或使用较粗的摘要回退。
- 52 周热力图比 Home 的概览密度更高，需要键盘 roving focus 和顶部 tooltip 避裁规则。

## 重审条件

- DSH 提供用户活动页或更精确的原生统计表面时。
