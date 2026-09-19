# 改法三句与三条验证

## 形状

```
改法｜新逻辑放在 <新方法或新类>；<已约定开关> 开启且 <请求条件>（看入参 <字段>）时走新入口；开关关闭或请求未命中时走 <原入口>
验证｜关闭：<入参> → <老结果>；开启且命中：<入参> → <新结果>；开启未命中：<另一条入参> → <不变的结果>
```

## 例子：偏远附加

```
改法｜新逻辑放在 calcRemoteFee；remoteFeeEnabled 开启且省份是新疆或西藏（看入参 province）时走新入口；开关关闭或省份未命中时走原 calc 主体
验证｜关闭：模板 1032 新疆 3.2kg → 33；开启且命中：同一条 → 41；开启未命中：模板 1032 广东 3.2kg → 30
```

入口分流长这样，旧主体一句不动：

```java
public int calc(Req r) {
    if (remoteFeeEnabled && isRemote(r.province)) return calcRemoteFee(r);   // 唯一一处改动
    int fee = tpl(r.tplId).first;
    // …… 旧主体原样 ……
    return fee;
}

private int calcRemoteFee(Req r) {   // 新方法，只放新逻辑，不再进上面那处分流
    return calcBase(r) + 8;
}
```

`calcBase` 只是示意：新方法要复用老计算时，调用老的公开入口之外的一条既有路径，或把老结果当输入；不把老方法的语句搬进来。
