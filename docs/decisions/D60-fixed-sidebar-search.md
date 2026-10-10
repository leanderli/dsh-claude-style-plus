# D60. Sidebar Search 固定在 New Session 下方

- **状态**：已实施
- **分组**：功能
- **关联**：取代 D22；D3、D11、D16、D19、D42、D45、D48

## 决定

- Search 是常驻按钮，插入宿主 New Session 行之后；不再插入 Logo row，不根据侧栏 hover 隐藏或显示品牌/搜索内容。收起侧栏时按钮变成 32px 图标入口，仍保留可访问名称。
- 定位使用 `SIDEBAR_NEW_SESSION_SELECTOR`，写入 DOM contract table 并由 Search feature manifest 声明。同步仅在宿主 New Session 按钮或父容器变化时移动入口。
- 保留宿主 `session.search` 快捷键：原生搜索输入仍挂载但不参与视觉布局；焦点抵达时打开插件 palette，再使用宿主清除按钮折回。固定行沿用 New Session 的无边框行样式，左侧为圆形底的搜索图标，文案为“搜索会话”/“Search sessions”，不展示快捷键帽；Ctrl+K 仍打开同一 palette。
- Palette、焦点归还、Esc、弹层互斥、数据源、匹配排序、内容搜索和导航沿用 D22。

## 理由

- Logo row 不再随鼠标进入侧栏交换内容或触发整行淡入淡出；搜索操作固定在 New Session 下方，避免 hover 成为 sidebar-wide 布局变化源。
- 独立入口始终可见，不遮挡品牌行，也保持 New Session 作为首个操作。

## 代价

- Search 依赖宿主 New Session 按钮的 class substring；DOM contract 和 Smoke 都检查它仍定位到该按钮。
- 页面只有在 Sidebar 挂载 New Session 行时才挂载按钮；原生 `session.search` shortcut 的转接仍依赖宿主搜索输入。

## 重审条件

- DSH 提供正式的 New Session 后置 Sidebar action slot 或公开的全局 Search palette command 时改用该 extension point。
