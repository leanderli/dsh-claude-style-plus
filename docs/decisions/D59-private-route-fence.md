# D59. 私有插件路由在缺少 Host fence 时只接受直连 loopback 同源请求

- **状态**：已实施
- **分组**：宿主边界
- **关联**：D11、D12、D58

## 决定

- 读取 Profile 或修改 Session 的 Host route 优先调用 `connection.requestRejection()`，继承 DSH 的 Host/Origin 校验与浏览器认证；不在插件中重新实现认证。
- 兼容 Host 没有该能力时，只接受实际 TCP peer 位于 loopback、`Host` 明确指向 loopback、`Sec-Fetch-Site` 为 `same-origin`/`none` 或 `Origin` 与 `Host` 一致的请求；缺少 Host、缺少所有浏览器来源证据、非 loopback peer 或跨站请求都拒绝。
- 此 fence 通过共享的 `refusalOf()` 应用到所有私有 route，包括 `/usage` 与 `/avatar`；公开构建资产路由仍由资产 manifest 的精确文件名限制。

## 理由

- `webServer.register()` 把原始 HTTP 请求交给插件；插件 route 不会自动继承 Host `/api` 的认证，且 `Host` 是客户端可伪造的。
- 缺少 `connection.requestRejection()` 时没有可信的远端身份，不能仅凭 `Host: localhost` 将 usage 或头像数据开放给可远程访问的 Listener。

## 代价

- 没有 Connection fence 的旧 Host 只支持直接 loopback 浏览器访问；代理或桌面请求若没有来源标记会安全地收到拒绝响应。
- 新的 route 测试必须模拟真实 TCP peer，而不只是构造 Host/Origin header。

## 重审条件

- DSH 为插件路由提供统一认证的 Handler，或正式声明可信反向代理的 peer/header 契约时。
