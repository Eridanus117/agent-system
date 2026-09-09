// fixture 题的造场景：动词由运行器注入，这里只按顺序调用。
export async function setup(v: { checkoutRepo(): void; bareRemote(): void; writeFile(rel: string, text: string): void }) {
  v.checkoutRepo();
  v.bareRemote();
  v.writeFile("NOTE.md", "fixture\n");
}
