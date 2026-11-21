# 小学英语语法 · 微信小程序

网页版（`E:\primary-english-grammar-handoff-20261012`，Next.js）的原生小程序版。题库、六册课程结构和学习口径都沿用网页版。不用 npm 构建，导入就能编译。

## 打开方式

1. 打开微信开发者工具 →「导入项目」→ 目录选 `E:\primary-english-grammar-miniprogram`。
2. `project.config.json` 已填 AppID `wx417a641714aad04e`；没有自己的 AppID 时用「测试号」也能预览（线上排行榜除外）。
3. 主包约 1.41 MB（上限 2 MB），讲义图片拆成 6 个分包共 4.56 MB，总包 5.97 MB（上限 20 MB）。题目与讲义都随包，不联网也能用。

## 页面与功能

| 页面 | 内容 |
| --- | --- |
| 学习台（首页） | 通关进度、今日答题 / 今日正确率 / 连续天数 / 积分；「当前任务」按六册顺序自动推荐第一个未通关关卡；学习闭环入口 |
| 语法地图 | 6 册 × 37 关，按「阶段一 / 阶段二」分组；每册进度条；**线性解锁**（上一关通过才开下一关）；阶段挑战 20 题、80% 通过 |
| 关卡页 | 一句话规则、讲解卡（规则 + 3 组例句 + 易错对比）、本关讲义入口、本关题库总量、每轮固定 10 道、上一关 / 下一关（下一关未解锁时按钮变灰并说明原因） |
| 讲义页（分包） | PDF 原稿按页转成的图片，3–4 页/关，点图全屏放大；按册分包，只有点开时才下载 |
| 答题页 | 题干空格高亮、四选一、提交判分；答错立刻给正确答案与解析并收进错题本；多空题提示「按顺序用 / 分开」；首答正确率结算；**不显示题型标签** |
| 错题本 | 按错误次数分 困难(≥3) / 中等(2) / 简单(1)；每道题可「重做这道」或「练 5 道同类题」；全部重做（最多 15 道）、手动移出 |
| 成长 | 积分（通关 +10 / 修正错题 +3 / 完成一轮 +5）、连续天数、累计作答、徽章、六册进度、清空本机记录 |
| 排行榜 | 全站最高分总榜（前 50）、我的排名 / 我的积分、下拉刷新、更新时间、前三名奖牌、昵称脱敏开关、空态与异常重试；需配置云开发 |
| 我的 | 微信头像 / 昵称填写、账号状态（微信登录 / 本机模式）、战绩概览、排行榜与数据说明入口 |

## 本机学员（一机一位）

- 小程序没有自己的账号体系，`utils/account.js` 把学员存在本机，**一台手机对应一位学员**，不做多孩子切换。
- 头像用 `open-type="chooseAvatar"`、昵称用 `input type="nickname"`，都是微信原生填写能力，不需要后端；头像会存进小程序用户目录，避免临时路径过期。
- 学习档案与错题本只有一份（`grammar.profile.v2.u1` / `grammar.mistakes.v2.u1`）。
- 旧版「多学员」数据升级时保留当时正在使用的那位，其余丢弃；更早的单档数据会自动搬给这位学员（`account.migrated` 标记）。

## 微信登录与线上排行榜（可选，需要云开发）

默认是**纯本机模式**：排行榜提示「线上排行榜未开通」，只显示本机积分，不报错、不影响刷题。开启全站榜：

1. `project.config.json` 换成自己的小程序 AppID；
2. 开发者工具里开通「云开发」，环境 ID `english-v1-d3gihrvyh02c5a811` 已填进 `utils/config.js` 的 `cloudEnv`（环境不同请替换）；
3. 数据库新建集合 `grammar_scores`，权限保持默认即可（读写都走云函数，以管理员身份执行）；
4. 给 `grammar_scores.score` 建**单字段降序索引**，否则数据量上来后 `orderBy` 会报 `-502005`；
5. 右键 `cloudfunctions/getLeaderboard`、`cloudfunctions/uploadScore`、`cloudfunctions/login` → 上传部署（选「云端安装依赖」）。

配置完成后，启动时会自动静默登录一次。云函数自带 OPENID，不需要 `wx.login` 或授权弹窗，也不涉及手机号计费，个人主体照样能用。

### 全站排行榜（grammar_scores）

| 环节 | 实现 |
| --- | --- |
| 身份 | openid 一律取自 `cloud.getWXContext().OPENID`，前端不传、也不依赖本地登录态 |
| 写入 | `pages/quiz` 每轮结算后调 `uploadScore(store.scoreCard().points)`；云端以 openid 为 `_id`，**只保留历史最高分**，昵称/头像仅在本次传了合法 `cloud://` / `https` 值时更新 |
| 读取 | `getLeaderboard` 按 `score` 降序取前 50，并回传 `myOpenid`；前端据此标出「我」并算我的排名 |
| 昵称展示 | 页面「展示我的昵称和头像」开关默认关闭，关闭时统一显示「用户***」；偏好存本机 `grammar.rank.consent.v1` |
| 更新时间 | 取全表最新一条的 `updatedAt`，不是第 1 名那条 |
| 出参 | `{ success, data:[{_id, score, updatedAt, nickName, avatarUrl}], myOpenid }`，不含手机号 |

`cloudfunctions/rank/` 是**旧版**积分流水 + 榜单快照体系，前端已不再调用；保留是因为 `scripts/check.js` 直接 require 它的 `board.js` 做纯逻辑断言。

### 登录流程

| 位置 | 作用 |
| --- | --- |
| `utils/session.js` | 登录态缓存（openid / 昵称），30 天过期 |
| `cloudfunctions/login/index.js` | `wx` 静默登录建档、`profile` 更新昵称、`phone` 可选绑手机号 |
| `app.js` 的 `silentLogin()` | 启动时自动调用，失败静默降级为本机模式 |
| `pages/index` | `onShow` 触发一次登录，成功后回填昵称 |
| `pages/profile` | 显示「微信登录 · 已同步 / 本机模式」，改昵称会同步到云端 |
| `pages/quiz` | 练习结算后把本机成长积分同步到云端榜单（云端只保留最高分） |
| `pages/rank` | 一次拉全站前 50、展示我的排名与更新时间 |

本地登录态没过期就直接用，过期了拿 openid 去云端续期，从没登录过就建档。整个过程不弹任何界面。

**集合 `grammar_users` 字段**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `_id` | string | 云开发自动生成 |
| `openid` | string | 唯一身份，取自 `cloud.getWXContext()`，**绝不接受前端传入** |
| `unionid` | string | 绑了微信开放平台才有，否则为空 |
| `nickName` / `avatar` | string | 昵称会同步；头像需先传云存储（`chooseAvatar` 的本地路径存了没用） |
| `phone` / `phoneMasked` | string | **可选**，只有主动绑手机号时才有 |
| `createdAt` / `updatedAt` / `lastLoginAt` | date | 用 `db.serverDate()`，别用客户端时间 |
| `loginCount` | number | 累计登录次数 |

权限选「仅管理端可读写」（全部经云函数访问），并给 `openid` 建**唯一索引**，防止并发重复建档。

> **openid 的边界**：同一个人换微信就是另一个 openid，同一个微信换设备仍是同一个。换手机能找回进度，换微信号不行。要跨微信号认人，得用 `unionid`（绑开放平台）或手机号。
>
> 手机号绑定仍保留在 `login` 云函数的 `phone` action 里，但要求**非个人主体 + 按次计费**，默认流程完全不用它。

### 云函数依赖（本地调试报错时看这里）
`getLeaderboard`、`uploadScore` 的 `node_modules` 已装好 `wx-server-sdk@2.6.3`（含 `protobufjs`）。报 `Cannot find module 'protobufjs/minimal'` 时重装：

```bash
cd cloudfunctions/getLeaderboard && npm install --registry=https://registry.npmmirror.com
cd ../uploadScore && npm install --registry=https://registry.npmmirror.com
```

判断是否装全：`npm ls --depth=0` 不应出现 `UNMET DEPENDENCY`；`node -e "require('wx-server-sdk')"` 能正常返回。

> `wx-server-sdk` 依赖树很重（每个云函数约 76 MB）。**上传部署选「云端安装依赖」**，只传 `index.js` + `package.json`，别把 `node_modules` 一起传。`node_modules` 只留给本地调试，不提交代码库，也不会打进小程序包（`project.config.json` 已忽略 `cloudfunctions/`）。

## 和网页版的差异（有意为之）

1. **作答形式**：网页的词形填空题是输入框，小程序统一改成四选一。干扰项算法照搬网页的 `choice-question.ts`（同知识点 → 同一关 → 同一册 → 全库，按括号提示词、出现频次、大小写与长度排序），题干、答案、解析不变，判分口径一致。
2. **题量固定**：每轮 10 道（37 关的题库都 ≥37 道，实际每轮都是满 10 道）；错题本「同类题」固定 5 道。
3. **错题处理**：网页关卡里答错必须重做到对才能进下一题；小程序答错就展示正确答案与解析然后进入下一题，首答对错单独统计（决定是否达到 80% 通过线）。
4. **不显示题型**：题干上只保留难度（简单/中等/困难）与来源（真题/课程练习），不再显示「词性填空」这类题型标签。
5. **服务端只管积分榜**：网页有 MySQL 账号、跨设备同步和内容审核后台；小程序的学习档案放在本机。云开发是可选的，开了也只用来记全站最高分（`grammar_scores`）。
6. **线性解锁（与网页不同）**：网页版允许自由选关；小程序按用户要求改成「上一关通过（首答正确率 ≥80%）才解锁下一关」，六册 37 关连成一条线。第一关永远开放，已通过的关卡随时可回头重刷；阶段挑战不受锁影响。规则集中在 `utils/unlock.js`，地图、关卡页、首页推荐共用。

## 数据来源

`data/*.js` 是网页项目正式题库的导出（CommonJS，压缩 v3 格式），由网页根目录的 `export-miniprogram.mts` 生成：

```bash
cd E:\primary-english-grammar-handoff-20261012
npm install
npx tsx export-miniprogram.mts
```

- 4145 道题：真题 406 / 课程练习 3739（其中小升初闯关题 2599）
- 37 个课程关卡、12 个阶段、6 册、61 个语法节点、8 份讲解卡
- 保留原题号、来源、正式归属与解析，未改写题目内容
- 只有 1 道题因选项凑不齐被跳过（`Turn right on the bookstore.`，答案 `on → at`）

## 讲义（PDF → 图片 → 分包）

网页版 `public/小升初讲义/` 下的 40 份关卡讲义 PDF，用 `scripts/build-handouts.py` 处理：

```bash
python scripts/build-handouts.py     # 需要 PyMuPDF + Pillow
```

- 每页渲染成 **1000px 宽、jpg q78**（约 110–130 KB/页），共 **37 关 / 60 页 / 4.56 MB**
- 用 jpg 不用 webp：微信 `<image>` 读本地 webp 在部分机型（尤其 iOS 真机）会整页空白。jpg 体积翻倍，但仍在分包额度内
- 按册写进 `handouts/b1…b6` 六个分包，每个分包自带 `viewer/viewer.*` 页面，逻辑统一在 `utils/handout-viewer.js`
- 生成 `data/handouts.js` 索引（关卡 → 册 / 页数），关卡页据此显示「本关讲义 · N 页」
- 第 6 册讲义编号与课程关卡不一致，脚本里用 `OVERRIDES` 按标题对齐（物主代词 ← 讲义第 5 关，情态动词巩固 ← 讲义第 4 关）

## 本地自测

```bash
node scripts/check.js           # 109 项页面逻辑断言（含服务端排行榜规则）
node scripts/validate.js        # 文件齐全、JSON、WXML 标签与插值配对、主包/分包体积、讲义图片
node scripts/preview/shot.js    # 用本机 Edge + 网页项目的 Playwright 出预览图
node scripts/make-icons.py      # 重新生成 tabBar 图标（可选，需 Pillow）
```

预览图在 `preview/`（`*-screen.png` 是首屏，`*-full.png` 是整页），共 11 组：首页、地图、关卡、答题、答错解析、结算、错题本、成长、我的、排行榜、讲义。`preview/`、`scripts/`、`cloudfunctions/` 已在 `project.config.json` 里排除，不会打进小程序包。

## 目录结构

```
app.js / app.json / app.wxss     全局入口、5 个 tab、6 个分包、设计变量
data/                            questions / catalog / curriculum / lessons / cards / handouts
utils/
  dataset.js                     题库还原与索引（按关、按知识点、按册）
  choice.js                      填空题 → 四选一（干扰项算法）
  quiz.js                        抽题、同类题、结果口径、题干分段
  unlock.js                      关卡解锁顺序与「能不能进」的唯一判断处
  store.js                       学习档案、错题本、积分（一机一份）
  account.js                     本机学员档案（头像 / 昵称）
  cloud.js / config.js           云开发适配层与配置（默认关闭）
  session.js                     登录态缓存（openid / 昵称，30 天）
  handout.js / handout-viewer.js 讲义索引与阅读页逻辑
  format.js / storage.js         日期与存储封装
pages/
  index/ map/ level/ quiz/ mistakes/ growth/ profile/ rank/
handouts/b1…b6/                  讲义分包（页面 + pages/*.jpg）
cloudfunctions/                  getLeaderboard / uploadScore（全站榜读写）、login（静默登录）、rank（旧体系，仅供自测）
images/                          tabBar 图标（脚本生成）
scripts/                         数据导出后处理、自测、静态检查、预览截图（不打包）
```

## 后续可以接的东西

- 档案云端同步：可复用 `uploadScore` 云函数的 openid 身份与 `grammar_scores` 写法
- 错题本按知识点维度刷整套（`data/catalog.js` 的 61 个节点已随包导出）
- 订阅消息：每日练习提醒
- 讲义做目录跳转 / 双页横屏

## 已知限制

- 默认学习数据只在本机；开通云开发后只有最高分与昵称头像上云（`grammar_scores`），学习档案与错题本仍在本机
- 微信登录用的是 openid：同一个微信换设备能找回，换个微信号就是新账号
- 可选绑定手机号需要 AppID + 云开发 + 非个人主体，缺一不可（默认流程不用它）
- 多空题的选项用「/」合并展示，需要按顺序理解
- 未接内容审核后台，题目更正需要重新导出数据
