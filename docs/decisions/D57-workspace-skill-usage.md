# D57. Workspace 与 Skill 统计由 Session 日志归属

- **状态**：已实施
- **分组**：运行时
- **关联**：D12、D44、D53、D56

## 决定

- Host 在既有 Session usage fold 中区分显式 `user/message` 的 `skill-invocation` 来源与 `tool/call` 中 `name = skill` 的模型工具调用，按本地日键记录两类次数；fork Session 的 Skill 计数跳过 `readSession()` 返回的 `inheritedEventCount` 之前事件，避免把复制来的调用当作新调用。
- 每个 Session 的 `skillDays` 与 Token/模型日桶一起写入 Plus 私有 cache；字段格式或 fold 语义变化时提升 cache version 并重读历史日志。
- Workspace 归属采用当前 `workspaceRegistry.list()` 返回的 `sessionIds`；无当前归属的可读 Session 单列为 Unassigned。日级 Token、模型桶沿用当前 Host fold 对完整日志的口径，Skill 调用则单独排除 fork 继承前缀。
- 全局 Token 报告仍按 D53 合并 cost-meter ledger 和本地 fold；ledger-only 数据没有逐 Workspace Token 桶，因此不按比例摊入 Workspace 行。Workspace 分项不承诺与全局账本相等。Session 日志读取失败与 Workspace registry 故障分别报告；registry 不可用时仍返回全局报告和可读日志的 Skill 汇总，Client 将未知成员显示为未知归属并说明原因。

## 理由

- Session log 是可重算的来源，能区分用户显式调用与模型发起的 Skill 工具调用，也能在任意 All/30d/7d 范围内精确去重会话。
- Workspace membership 由 DSH registry 维护；Host 读取该 registry 的成员，而不从 cwd 名称或模型文本猜 Workspace。

## 代价

- 首次升级会因 cache version 变化回填历史 Session 日志；损坏或不可读的日志会让 Workspace/Skill 结果显式标为 partial。
- 被清理或不可读取的 Session 不会获得伪造的 Workspace/Skill 归属；任务耗时不在这些事件中可靠存在，因此不展示。

## 重审条件

- DSH 提供包含逐 Session、逐日 Workspace 与 Skill 归属的正式只读服务时。
