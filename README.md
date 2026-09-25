# WireLink Studio（物联接线台）

从零开发的浏览器端工业设备接线图编辑器。产品范围与验收要求见[需求规范书](./WireLink%20Studio%20新项目计划与需求规范书.md)。当前已完成项目初始化和工程数据模型，尚未实现工程编辑界面。

## 开发

要求 Node.js 22.12+（22.x）、24.x 或 26.x 及更新版本，并安装 npm。

```bash
npm ci
npm run dev
```

本地开发地址由 Vite 启动命令输出。

```bash
npm run typecheck
npm run format:check
npm test
npm run build
```

## 技术决策

- 首版采用 React、TypeScript、Vite；画布阶段计划使用 React Flow。
- 工程文件以自包含、带版本号的 JSON 为基础，图片资产将内嵌保存。
- 不引入后端、账号和协同编辑。
- 端子位置与电气角色分离，连线以类型兼容性与容量规则为准。
- 线束子线是实际接线数据，聚合线只是画布视图。
- 连接容量超限时，交互创建会被阻止；校验器仍检查导入或后续编辑造成的超限数据。该项与规范书验收场景 D 的表述差异待产品确认。

## 工程数据模型

`src/model/project.ts` 导出工程各对象的 TypeScript 类型和对应运行时结构规则：

- `createEmptyProject(name)` 创建空的版本 2 工程。
- `parseProjectFile(json)` 读取 JSON，检查版本、必需字段、字段类型与各集合中的重复 ID。
- `serializeProjectFile(project)` 校验并生成格式化的 JSON。

读取时保留未知可选字段，方便未来版本扩展。端子兼容性、连接容量、悬空引用等业务问题将在校验面板任务中处理；当前页面尚未接入打开或保存按钮。

后续任务按工程文件管理、设备与四边端子、普通导线、校验表格、图片资产、线束、导出的顺序推进。
