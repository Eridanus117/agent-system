// 假 QA agent：数提示词里「主人：」的次数，到 FAKE_QA_MAX 就说结束。
let s = "";
process.stdin.on("data", (d) => { s += d; });
process.stdin.on("end", () => {
  if (process.env.FAKE_QA_BROKEN === "1") { console.log("我不会 JSON"); return; }
  const max = Number(process.env.FAKE_QA_MAX ?? 2);
  const n = (s.match(/^主人：/gm) ?? []).length;
  console.log(n >= max ? JSON.stringify({ done: true, reason: "够了" }) : JSON.stringify({ done: false, reply: "按你推荐的" }));
});
