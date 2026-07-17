# Task 8 交付报告

## 交付内容

- 根目录新增 `npm run dev`、`npm run test` 和 `npm run build`；开发启动器会同时启动 FastAPI 热重载与 Vite，并转发 `SIGINT` / `SIGTERM`，任一子进程意外退出会终止另一子进程并以失败状态退出。
- FastAPI 在 `frontend/dist` 存在时将其挂载到根路径；已验证 `/` 静态首页可用且 `/api/health` 仍由 API 路由处理。
- 新增固定 SMA 验收场景：确认 2024-01-05 买入、2024-01-10 卖出，使用两次下一交易日开盘价手算并断言期末权益为 `1100.0`。
- 新增根目录忽略规则与中文 README，包含环境要求、安装/启动、CSV 约束、撮合及指标公式、以及非投资建议免责声明。

## TDD 与验证记录

1. 首先创建固定场景测试并运行 `cd backend && python -m pytest tests/test_fixed_scenario.py -q`；测试按预期因缺少 `run_fixed_fixture` 导入失败。
2. 接通测试夹具后，同一测试通过。
3. 使用 `.venv` 执行 `npm run test && npm run build`：后端 `70 passed`，前端 `7` 个测试文件、`20` 个测试通过，Vite 生产构建成功。
4. 执行 `node --check scripts/dev.mjs` 成功。
5. 构建产物存在时，以 FastAPI `TestClient` 验证 `/` 返回 200，并验证 `/api/health` 返回 `{ "status": "ok" }`。

## 自审结论

- 没有修改前端的包管理器或锁文件。
- 静态挂载在全部 `/api/*` 路由声明之后，已通过健康检查确认 API 没有被前端根路径覆盖。
- 未启动持久化开发服务器；最终浏览器全流程验证留给控制任务执行。

## 注意事项

静态托管的 `TestClient` 检查在当前 Python 3.13 环境输出了 `blake2b` / `blake2s` 可选哈希算法的解释器日志，但命令以 0 退出，且完整 pytest 套件未出现该日志或失败。

## 后续审查修正

- Windows 清理分支改为调用 `taskkill /pid <pid> /T /F`，确保 FastAPI 热重载等派生进程一并终止；Unix 仍使用进程组信号。终止 helper 支持平台、`spawn` 与 `kill` 注入，并跳过已退出的子进程，避免重复终止和退出竞争。
- 新增 `scripts/dev.test.mjs`：使用模拟 `spawn` 断言 Windows 分支真实调用的命令及参数，不会终止任何实际进程。
- README 的 Node 前置条件修正为 Vite 8 锁定引擎范围：`^20.19.0` 或 `>=22.12.0`；当前本机 Node 22 符合。
