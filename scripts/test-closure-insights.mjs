import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const server = await createServer({
  root,
  appType: "custom",
  logLevel: "error",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true },
});

try {
  const { buildEmployeeClosureInsight } = await server.ssrLoadModule("/src/lib/closure.ts");

  const closedInsight = buildEmployeeClosureInsight("测试员工", "测试部", [
    {
      name: "测试员工",
      department: "测试部",
      week: "5月第三周 5/12-5/16",
      status: "准时",
      total: 82,
      level: "A-",
      resultScore: 25,
      problemScore: 18,
      reflectionScore: 17,
      planScore: 18,
      punctualityScore: 10,
      numberCount: 2,
      textLength: 320,
      resultSummary: "完成旧项目复盘。",
      problemSummary: "送审节点缺少标准。",
      nextPlanSummary: "下周输出送审SOP模板，并在群里试运行一次。",
    },
    {
      name: "测试员工",
      department: "测试部",
      week: "5月第四周 5/18-5/22",
      status: "准时",
      total: 88,
      level: "A",
      resultScore: 28,
      problemScore: 18,
      reflectionScore: 18,
      planScore: 19,
      punctualityScore: 10,
      numberCount: 5,
      textLength: 520,
      resultSummary: "已输出送审SOP模板，并在群内试运行，收集3条反馈后更新清单。",
      problemSummary: "后续要继续优化节点提醒。",
      nextPlanSummary: "继续验证SOP。",
    },
  ]);

  assert.equal(closedInsight.latestPair?.status, "closed");
  assert.equal(closedInsight.persona, "机制型成员");

  const repeatedInsight = buildEmployeeClosureInsight("空转员工", "测试部", [
    {
      name: "空转员工",
      department: "测试部",
      week: "5月第三周 5/12-5/16",
      status: "准时",
      total: 70,
      level: "B",
      resultScore: 18,
      problemScore: 17,
      reflectionScore: 14,
      planScore: 12,
      punctualityScore: 10,
      numberCount: 0,
      textLength: 220,
      resultSummary: "正常推进。",
      problemSummary: "客户转化卡住，需要支持。",
      nextPlanSummary: "下周继续推进客户转化。",
    },
    {
      name: "空转员工",
      department: "测试部",
      week: "5月第四周 5/18-5/22",
      status: "准时",
      total: 68,
      level: "B",
      resultScore: 17,
      problemScore: 18,
      reflectionScore: 12,
      planScore: 11,
      punctualityScore: 10,
      numberCount: 0,
      textLength: 210,
      resultSummary: "本周还是继续推进客户转化。",
      problemSummary: "客户转化仍然卡住，需要支持。",
      nextPlanSummary: "下周继续推进客户转化。",
    },
  ]);

  assert.equal(repeatedInsight.latestPair?.status, "repeated_loop");
  assert.ok(repeatedInsight.score < closedInsight.score);

  console.log("closure insight checks passed");
} finally {
  await server.close();
}
