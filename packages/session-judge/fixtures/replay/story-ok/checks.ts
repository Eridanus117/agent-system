// fixture 题的机械检查：动词由运行器注入。
export function checks(v: { ownerReplyBeforeFirstCodeWrite(): unknown; noPush(): unknown }) {
  return [v.ownerReplyBeforeFirstCodeWrite(), v.noPush()];
}
