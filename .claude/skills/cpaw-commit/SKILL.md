# Skill: cpaw-commit

cpaw 项目的代码提交、版本发布流程。

## 提交前检查

并行运行以下命令了解变更全貌：

```bash
git status          # 绝不加 -uall
git diff            # 含已暂存和未暂存
git log --oneline -5
```

## 暂存文件规则

**必须明确指定文件名**，禁止 `git add -A` 或 `git add .`。

禁止提交的文件：`.env`、密钥文件、临时调试脚本、`node_modules/`、`dist/`。

## 提交信息规范

```
<type>: <中文简短描述>

- 变更点 1
- 变更点 2

Co-Authored-By: Claude <model> <noreply@anthropic.com>
```

### Type 类型

| Type | 用途 |
|------|------|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `refactor` | 代码重构（不改变行为） |
| `chore` | 构建、依赖、配置等杂项 |
| `docs` | 文档更新 |
| `test` | 测试相关 |
| `style` | 样式调整（不影响逻辑） |

**必须使用 HEREDOC 传递提交信息**：

```bash
git commit -m "$(cat <<'EOF'
feat: 简短描述

- 变更点 1
- 变更点 2

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

## 提交验证

提交后运行 `git status` 确认工作区干净。

## 推送规则

**默认不推送**，用户明确要求时才执行：

```bash
git push origin main
```

## 版本发布流程

当用户要求发布 npm 时，按以下顺序执行：

### 1. 确认变更已提交

```bash
git status   # 必须 clean
```

### 2. Bump 版本

根据变更类型选择：
- **patch** (0.1.7 → 0.1.8): bug 修复、小改进
- **minor** (0.1.x → 0.2.0): 新功能
- **major** (0.x → 1.0.0): 破坏性变更

```bash
npm version patch --no-git-tag-version   # 或 minor / major
```

### 3. 提交版本号

```bash
git add package.json
git commit -m "$(cat <<'EOF'
0.1.8

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

版本提交信息只写版本号（参考历史: `0.1.5`, `0.1.6`, `0.1.7`）。

### 4. 发布到 npm

```bash
npm publish
```

`prepublishOnly` 钩子会自动执行 `npm run build`。

如果 npm token 过期，提示用户先运行 `npm login`。

### 5. 推送到 GitHub

```bash
git push origin main
```

## 禁止操作

- 禁止 `git push --force` 到 main
- 禁止 `--no-verify` 跳过 hooks
- 禁止 `git reset --hard` 丢弃未确认的变更
- 禁止提交敏感文件
