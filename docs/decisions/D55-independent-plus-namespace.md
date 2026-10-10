# D55. Plus fork 使用完整独立命名空间

- **状态**：已实施
- **分组**：分发与流程
- **关联**：D11、D33、D36、D38、D42、D49、D51

## 决定

- Fork 的 npm bundle 名为 `dsh-claude-style-plus`，workspace 子包统一在 `@dsh-claude-style-plus/*` 下；皮肤 id 与 Cordis row 分别使用 `claude-style-plus` 与 `ui-skin-claude-style-plus`，Settings section 和 Home usage dock entry 分别使用 `claude-style-plus` 与 `claude-style-plus-usage`。
- Body 标记、stylesheet owner、CSS class/token、virtual module、私有 route、Host usage cache、LocalStorage 与 profile avatar 子目录都使用 Plus 前缀；原版 bundle 的对应路径和 DOM 标记不被 Plus 读写。
- 保留上游 MIT 许可与来源说明；不自动复制原版的偏好、缓存或头像文件。

## 理由

- 两个 bundle 可以同时安装；DOM 清理、stylesheet 管理、路由和磁盘缓存必须能分辨各自所有者。
- 共享原版 profile 数据会让一个 fork 移除另一个 fork 写入的头像或统计缓存，也会使用户无法独立验证版本。

## 代价

- Plus 的设置、缓存和自定义头像独立于原版；已有头像需在 Plus 设置中重新上传。
- 每个 fork 的全局 CSS 与 DOM class 都带独立前缀，升级时需同步维护该命名边界。

## 重审条件

- DSH 为主题插件提供受支持的多版本命名空间或独立数据目录声明时。
