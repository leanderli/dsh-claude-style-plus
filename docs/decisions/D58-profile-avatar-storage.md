# D58. 自定义头像按 DSH Profile 隔离保存

- **状态**：已实施
- **分组**：宿主边界
- **关联**：D11、D12、D55

## 决定

- General 设置允许选择 PNG/JPEG/WebP 图片，浏览器先验证文件并提供可拖动、键盘微调和缩放的正方形裁切；上传前缩放为 128px raster，输出不超过 512 KiB。
- Host 只通过 Plus 私有 `/avatar` route 提供 GET/HEAD/PUT/DELETE；写入沿用 `requestRejection()` 同源 fence（D59），校验 MIME、文件签名和大小，响应 `private, no-store` 与内容哈希 ETag。Host 缺少 `requestRejection()` 时，fallback 同时要求实际 TCP peer 为 loopback、Host 为 loopback 且带同源浏览器证据，绝不单独信任可伪造的 Host。
- 图片对象、`current.json` 指针和临时文件只写在当前 DSH Profile 目录下的 `dsh-claude-style-plus/avatars/`；目录 0700，文件 0600，头像优先于登录账号头像与 HDSL launcher 头像。
- 不读取、不复制原版 `dsh-claude-style/avatars/` 或其 LocalStorage key；原版头像数据保持不动，Plus 头像由用户单独上传。

## 理由

- 原版与 Plus 可并行安装，不应互相覆盖或删除个人图片；DSH Profile 是这类个人配置数据的所有权边界。
- 图片由 Host 按固定 package-owned 子目录读取，请求不提供路径；内容签名和哈希复核避免把错误文件或错误 MIME 当作头像提供。

## 代价

- 从浏览器 LocalStorage 迁到服务端的 key 只属于 Plus；原版已有图片不会自动出现在 Plus。
- 不支持 GIF、SVG 或任意 URL；浏览器无法处理超大或异常尺寸的输入时会显示明确错误。

## 重审条件

- DSH 提供受支持的 Profile-scoped avatar service 且能维持相同的 package 隔离时。
