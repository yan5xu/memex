# mbase 使用指南

`mbase` 是一个 local-first 的对象图谱知识库。它把结构化对象存在 SQLite，把长正文、研究记录、证据说明存在 Markdown 文件里。人可以在 Web UI 阅读和编辑，agent 可以用 CLI/API 稳定创建、查询和更新。

## 1. 核心概念

- `Vault`：一个 mbase 知识库目录。目录里有 `.mbase/mbase.db`、`bodies/`、`assets/`，也可以放 `mbase.graph-views.json`。
- `Type`：对象类型，例如 `company`、`person`、`source.item`、`note`、`concept`。
- `Field`：type 上的字段。字段可以是普通属性，也可以是关系字段。
- `Object`：某个 type 的实例，例如 `company.lightsprint`。
- `Body`：对象的 Markdown 正文，适合写档案、证据、分析和人的判断。
- `Field link`：由 `ref` / `ref_list` 字段产生的强关系。
- `Body link`：Markdown 里的 `[[object.id]]` 产生的弱提及关系。
- `Graph view`：基于对象和 links 的图谱视图，可以全局看，也可以用配置视图看局部路径。

基本心智是：**SQLite 管 schema 和对象字段，Markdown 管长正文，links 把对象网络连起来。**

## 2. 安装和启动

当前系统默认使用 `/tmp/mbase`：

```bash
/tmp/mbase --help
```

如果在源码目录开发：

```bash
cd /Users/cp/workspace/assistant/system/tools/mbase
go build -o /tmp/mbase ./cmd/mbase
```

启动 Web UI：

```bash
/tmp/mbase serve --addr 127.0.0.1:8766
```

打开：

```text
http://127.0.0.1:8766
```

Web UI 可以用 URL 参数指定 vault：

```text
http://127.0.0.1:8766/?vault=%2Fpath%2Fto%2Fvault
```

多个浏览器窗口可以打开不同 vault。关键上下文在 URL 的 `vault=` 参数里，`localStorage` 只用于 recent/default。

## 3. 创建和检查 Vault

创建新 vault：

```bash
VAULT=/path/to/my-vault
/tmp/mbase -C "$VAULT" init
```

检查 vault：

```bash
/tmp/mbase -C "$VAULT" vault info
/tmp/mbase -C "$VAULT" status
/tmp/mbase -C "$VAULT" issues
/tmp/mbase -C "$VAULT" doctor
```

常用约定：

- 命令里始终带 `-C "$VAULT"`，避免跑错库。
- `issues` 返回 `count: 0` 才表示结构关系健康。
- 手动改 Markdown 后运行 `body refresh` 或 `refresh`，让 `[[object.id]]` 重新抽取成 body links。

## 4. 设计 Schema

先创建 type：

```bash
/tmp/mbase -C "$VAULT" type create company
/tmp/mbase -C "$VAULT" type create person
/tmp/mbase -C "$VAULT" type create source.item
```

查看 type：

```bash
/tmp/mbase -C "$VAULT" type list
/tmp/mbase -C "$VAULT" type show company
```

添加字段：

```bash
/tmp/mbase -C "$VAULT" field add company name --kind text --required
/tmp/mbase -C "$VAULT" field add company status --kind enum --values active,archived,ignored
/tmp/mbase -C "$VAULT" field add company tags --kind list
/tmp/mbase -C "$VAULT" field add company website --kind url
/tmp/mbase -C "$VAULT" field add company founders --kind ref_list --target person
/tmp/mbase -C "$VAULT" field add source.item about_company --kind ref --target company
```

字段类型：

| kind | 用途 | 输入 |
| --- | --- | --- |
| `text` | 字符串 | `name=Lightsprint` |
| `number` | 数字 | `score=0.8` |
| `boolean` | 布尔 | `active=true` |
| `date` | 日期/时间字符串 | `captured_at="2026-07-10 10:30:00"` |
| `url` | URL 字符串 | `website=https://example.com` |
| `enum` | 枚举 | 需要 `--values a,b,c` |
| `list` | 字符串数组 | `tags=ai,devtool` |
| `ref` | 指向一个对象 | 需要 `--target <type>` |
| `ref_list` | 指向多个对象 | 需要 `--target <type>` |
| `json` | JSON 风格字段 | 用于后续扩展 |

关系建模建议：

- 稳定、强语义关系放 `ref` / `ref_list` 字段。
- 正文里自然提到的对象放 `[[object.id]]`。
- 不要把所有关系都塞进 Markdown。需要查询、过滤、图谱路径的关系应建字段。

## 5. 创建对象

推荐日常命令：

```bash
/tmp/mbase -C "$VAULT" create company company.lightsprint \
  name=Lightsprint \
  title=Lightsprint \
  status=active \
  tags=agentic-sdlc,demo-led \
  website=https://lightsprint.com
```

创建时同时写 body：

```bash
cat <<'EOF' | /tmp/mbase -C "$VAULT" create company company.lightsprint \
  name=Lightsprint title=Lightsprint status=active --body-stdin
# Lightsprint

Lightsprint is linked to [[concept.agentic-sdlc]].
EOF
```

从文件写 body：

```bash
/tmp/mbase -C "$VAULT" create note note.product-takeaway \
  title="Product takeaway" \
  --body ./note.product-takeaway.md
```

create 与 upsert：

- `create`：对象已存在会失败。
- `upsert`：对象不存在就创建，存在就更新字段，适合 agent 重复写入。

```bash
/tmp/mbase -C "$VAULT" upsert company company.lightsprint \
  name=Lightsprint status=active
```

删除对象：

```bash
/tmp/mbase -C "$VAULT" delete company.lightsprint --yes
```

删除只移除 SQLite 对象和关系，Markdown body 文件会保留在磁盘上，避免误删正文。

## 6. 读取和更新对象

读取对象详情：

```bash
/tmp/mbase -C "$VAULT" get company.lightsprint
```

不返回完整 body，适合 agent 节省 token：

```bash
/tmp/mbase -C "$VAULT" get company.lightsprint --no-body
/tmp/mbase -C "$VAULT" get company.lightsprint --body-preview 800
```

设置普通字段：

```bash
/tmp/mbase -C "$VAULT" set company.lightsprint status active
/tmp/mbase -C "$VAULT" set company.lightsprint tags agentic-sdlc,demo-led
```

设置关系字段：

```bash
/tmp/mbase -C "$VAULT" link company.lightsprint founders person.alice
/tmp/mbase -C "$VAULT" link source.launch-lightsprint about_company company.lightsprint
```

底层兼容命令仍可用：

```bash
/tmp/mbase -C "$VAULT" object create company --id company.lightsprint --field name=Lightsprint
/tmp/mbase -C "$VAULT" object get company.lightsprint
/tmp/mbase -C "$VAULT" object set company.lightsprint status active
/tmp/mbase -C "$VAULT" object link company.lightsprint founders person.alice
/tmp/mbase -C "$VAULT" object unlink company.lightsprint founders person.alice
```

日常优先用顶层 `create/get/set/link/query`，不要把心智停留在底层 `object` 子系统。

## 7. Source Item 快捷写入

`source.item` 是证据内容单元，例如文章、网页快照、tweet、YC launch、Similarweb snapshot。

如果 schema 里已有 `source.item` 和相应字段，可以用：

```bash
cat <<'EOF' | /tmp/mbase -C "$VAULT" source add source.yc-launch.lightsprint \
  --title "Lightsprint YC Launch" \
  --url "https://www.ycombinator.com/launches/..." \
  --platform yc \
  --item-type launch \
  --quality full \
  --processing-status parsed \
  --evidence-level S1 \
  --about-company company.lightsprint \
  --body-stdin
# Lightsprint YC Launch

Evidence summary and extracted details.
EOF
```

`source add` 本质是对 `source.item` 的 upsert，并内置常用 alias：

| flag | 字段 |
| --- | --- |
| `--title` | `title` |
| `--url` | `url` |
| `--platform` | `platform` |
| `--item-type` | `item_type` |
| `--author` | `author` |
| `--published-at` | `published_at` |
| `--collected-at` | `collected_at` |
| `--quality` | `quality` |
| `--processing-status` | `processing_status` |
| `--evidence-level` | `evidence_level` |
| `--summary` | `summary` |
| `--language` | `language` |
| `--capture-method` | `capture_method` |
| `--capture-status` | `capture_status` |
| `--captured-at` | `captured_at` |
| `--about-company` | `about_company` |
| `--from-touchpoint` | `from_touchpoint` |

也可以继续写任意字段：

```bash
/tmp/mbase -C "$VAULT" source add source.website.demo \
  --title "Website snapshot" \
  --field custom_field=value
```

## 8. Markdown Body

查看 body 路径：

```bash
/tmp/mbase -C "$VAULT" body path company.lightsprint
```

覆盖 body：

```bash
cat ./company.lightsprint.md | /tmp/mbase -C "$VAULT" body write company.lightsprint --stdin
```

追加 body：

```bash
cat <<'EOF' | /tmp/mbase -C "$VAULT" body append company.lightsprint --stdin

## Follow-up

New evidence from [[source.website.lightsprint]].
EOF
```

刷新 body links：

```bash
/tmp/mbase -C "$VAULT" body refresh company.lightsprint
/tmp/mbase -C "$VAULT" refresh
```

Markdown 支持：

- 标准 Markdown 标题、段落、列表、引用、代码块。
- GFM 表格、task list、脚注、删除线。
- HTML：`details`、`summary`、`kbd`、`mark`、`ins`、`figure`、`figcaption`。
- `mermaid` 代码块。
- mbase 双链：`[[company.lightsprint]]`、`[[company.lightsprint|Lightsprint]]`。
- Obsidian 风格图片：`![[assets/demo.png]]`、`![[assets/demo.png|Product demo]]`。
- 图片 caption：`![Product demo](assets/demo.png)` 会显示说明文字。
- 图片布局：`{wide}`、`{full}`、`{inline}`，例如 `![Product demo {wide}](assets/demo.png)`。
- mbase 结构化块：`facts`、`timeline`。

`facts`：

````md
```facts
Status: Active
Category: Agentic SDLC
Evidence: YC launch, website
```
````

`timeline`：

````md
```timeline
2026-01 | YC launch captured
2026-02 | Product demo reviewed
```
````

注意：`> [!NOTE]` 这类 GitHub Alert 不是 mbase 核心语法。

## 9. 图片和资产

导入本地图片到 vault：

```bash
/tmp/mbase -C "$VAULT" asset import ./screenshot.png --name company-demo.png
```

输出会包含可直接粘进 Markdown 的图片语法：

```text
![company-demo](assets/company-demo.png)
```

Web UI 也有专门的资产上传 API：

```bash
curl -F "vault=$VAULT" -F "file=@./screenshot.png" http://127.0.0.1:8766/api/assets
```

建议：

- 对象正文里的图片放 `assets/`。
- 公司类对象至少保留：官网/定位图、产品界面或 demo 图、launch/流量/证据图。
- 图片是 body 的一部分，不要只把 URL 存在字段里。

## 10. 查询

查询某个 type：

```bash
/tmp/mbase -C "$VAULT" query company
```

选择字段：

```bash
/tmp/mbase -C "$VAULT" query company --select id,title,status,tags
```

过滤：

```bash
/tmp/mbase -C "$VAULT" query company --where status=active
/tmp/mbase -C "$VAULT" query company --where "title contains sprint"
/tmp/mbase -C "$VAULT" query company --where status!=ignored
```

多个 `--where` 是 AND：

```bash
/tmp/mbase -C "$VAULT" query source.item \
  --where about_company=company.lightsprint \
  --where quality=full
```

排序和限制：

```bash
/tmp/mbase -C "$VAULT" query source.item \
  --select id,title,published_at \
  --sort published_at:desc \
  --limit 20
```

`ref` / `ref_list` 字段可以按对象 id 查询：

```bash
/tmp/mbase -C "$VAULT" query note --where about_company=company.lightsprint
```

## 11. Links 和 Backlinks

看一个对象指向谁：

```bash
/tmp/mbase -C "$VAULT" links company.lightsprint
```

看谁指向这个对象：

```bash
/tmp/mbase -C "$VAULT" backlinks company.lightsprint
```

过滤：

```bash
/tmp/mbase -C "$VAULT" backlinks company.lightsprint --type source.item
/tmp/mbase -C "$VAULT" backlinks company.lightsprint --kind field
/tmp/mbase -C "$VAULT" backlinks company.lightsprint --relation about_company
/tmp/mbase -C "$VAULT" backlinks company.lightsprint --filter launch
```

link 的 `kind`：

- `field`：由 `ref` / `ref_list` 字段产生。
- `body`：由 Markdown `[[object.id]]` 产生。

## 12. Graph

导出全图：

```bash
/tmp/mbase -C "$VAULT" graph export --json
```

Web UI 的 Graph 页面可以：

- 查看全图或 schema graph。
- 选择 center object。
- 搜索 center。
- 配置 graph view。
- 过滤 type。
- 点击节点预览 Markdown。
- 双击节点切换中心。

配置自定义 graph view：

```json
{
  "version": 1,
  "views": [
    {
      "id": "company-investors",
      "label": "Company Investors",
      "root_type": "company",
      "steps": [
        { "direction": "in", "relation": "company", "target_type": "investment" },
        { "direction": "out", "relation": "investor", "target_type": "investor" }
      ]
    }
  ]
}
```

写入：

```bash
cat mbase.graph-views.json | /tmp/mbase -C "$VAULT" graph views write --stdin
```

查看：

```bash
/tmp/mbase -C "$VAULT" graph views
```

设计 graph view 的原则：

- 不要写死业务视图到代码里，优先放 vault 配置。
- view 是“从中心对象沿字段路径看几层”，不是全图过滤器。
- 大图默认用 type 过滤和局部 view，避免所有节点一屏堆出来。

## 13. Web UI

启动：

```bash
/tmp/mbase serve --addr 127.0.0.1:8766
```

主要页面：

- `Objects`：按 type 看表格，查询对象。
- `Detail`：对象字段、Markdown body、编辑正文、保存图片、打开 inspector。
- `Graph`：图谱和自定义 graph view。
- `Schema`：查看 type/field。
- `Health`：查看 issues。
- `VI`：视觉测试页面，用于组件、Markdown、控件一致性走查。

浏览器 automation：

```js
window.mbase.state()
window.mbase.uiState()
window.mbase.openObject("company.lightsprint")
window.mbase.selectType("company")
window.mbase.openGraph()
window.mbase.graphWorkspace.state()
window.mbase.relationGraph.state()
```

这让 agent 可以用 `browser eval` 直接操作 UI 和读取状态。

## 14. JSON、jq 和 API

CLI 默认输出给人看。加 `--json` 输出机器可读 JSON：

```bash
/tmp/mbase -C "$VAULT" get company.lightsprint --json
```

选择 JSON 字段：

```bash
/tmp/mbase -C "$VAULT" get company.lightsprint --json object,links,backlinks
/tmp/mbase -C "$VAULT" get company.lightsprint --json object,body_abs_path --jq '.body_abs_path'
```

`--json field,field` 会从 result data 里挑字段，类似 `gh` 的字段选择。`--jq` 使用内置 jq 表达式，不要求系统安装 `jq`。

Web API：

```bash
curl http://127.0.0.1:8766/api/run \
  -H "content-type: application/json" \
  --data-raw '{"vault":"/path/to/vault","argv":["query","company","--select","id,title,status"]}'
```

写 body：

```bash
curl http://127.0.0.1:8766/api/run \
  -H "content-type: application/json" \
  --data-raw '{"vault":"/path/to/vault","argv":["body","write","company.lightsprint","--stdin"],"stdin":"# Lightsprint\n"}'
```

兼容旧入口：`POST /_mbase/run`。

## 15. 推荐工作流

创建研究对象：

```bash
/tmp/mbase -C "$VAULT" upsert company company.demo \
  name="Demo Company" \
  title="Demo Company" \
  status=active \
  tags=agent-infra,demo-led
```

创建证据：

```bash
cat evidence.md | /tmp/mbase -C "$VAULT" source add source.demo.website \
  --title "Demo website snapshot" \
  --url "https://demo.example" \
  --platform website \
  --quality full \
  --processing-status parsed \
  --about-company company.demo \
  --body-stdin
```

创建人的判断：

```bash
cat note.md | /tmp/mbase -C "$VAULT" create note note.demo-takeaway \
  title="Demo takeaway" \
  about_company=company.demo \
  --body-stdin
```

刷新和验证：

```bash
/tmp/mbase -C "$VAULT" body refresh company.demo
/tmp/mbase -C "$VAULT" issues
/tmp/mbase -C "$VAULT" get company.demo --body-preview 800
```

Web UI 打开：

```text
http://127.0.0.1:8766/?view=detail&vault=/path/to/vault&object=company.demo
```

## 16. 常见坑

- **忘记 `-C`**：命令会跑到当前目录或默认目录。长期 vault 一律显式 `-C "$VAULT"`。
- **URL 里的 `?` 和 `&`**：shell 里写 URL 字段要加引号，否则 zsh 可能展开或截断。
- **body 改完没刷新**：新增 `[[object.id]]` 后要 `body refresh <id>` 或 `refresh`。
- **ref/ref_list 用错字段**：`link <id> <field> <target-id>` 的 `<field>` 必须是 `ref` 或 `ref_list`。
- **enum 写错值**：enum 必须精确匹配 `--values` 里的值。
- **list/ref_list 分隔**：多个值用逗号，例如 `tags=a,b,c`。
- **误删对象**：`delete` 要 `--yes`；body 文件会保留，但 SQLite 对象会删除。
- **JSON 太大**：agent 用 `get --json object,links --no-body` 或 `--body-preview`，不要默认吃完整 body。
- **两个浏览器窗口不同 vault**：确保 URL 有各自的 `vault=` 参数。
- **图谱太乱**：优先用自定义 graph view、type 过滤、center object，不要默认看全图。

## 17. 最小可运行例子

```bash
VAULT=/tmp/mbase-demo
rm -rf "$VAULT"

/tmp/mbase -C "$VAULT" init
/tmp/mbase -C "$VAULT" type create concept
/tmp/mbase -C "$VAULT" field add concept title --kind text --required
/tmp/mbase -C "$VAULT" field add concept related --kind ref_list --target concept

/tmp/mbase -C "$VAULT" create concept concept.rag title=RAG

cat <<'EOF' | /tmp/mbase -C "$VAULT" create concept concept.llm-wiki title="LLM Wiki" --body-stdin
# LLM Wiki

Different from [[concept.rag]], but related.
EOF

/tmp/mbase -C "$VAULT" link concept.llm-wiki related concept.rag
/tmp/mbase -C "$VAULT" body refresh concept.llm-wiki
/tmp/mbase -C "$VAULT" get concept.llm-wiki
/tmp/mbase -C "$VAULT" query concept --select id,title,related
/tmp/mbase -C "$VAULT" issues
```

启动 UI：

```bash
/tmp/mbase serve --addr 127.0.0.1:8766
```

打开：

```text
http://127.0.0.1:8766/?vault=/tmp/mbase-demo
```
