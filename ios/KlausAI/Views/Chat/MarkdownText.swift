import SwiftUI

/// Renders markdown text with code blocks, copy button, and basic syntax highlighting.
struct MarkdownText: View {
    let text: String

    init(_ text: String) {
        self.text = text
    }

    var body: some View {
        let blocks = parseCodeBlocks(text)
        VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                switch block {
                case .text(let content):
                    if let attributed = try? AttributedString(markdown: content, options: .init(
                        allowsExtendedAttributes: true,
                        interpretedSyntax: .inlineOnlyPreservingWhitespace,
                        failurePolicy: .returnPartiallyParsedIfPossible
                    )) {
                        Text(attributed)
                            .textSelection(.enabled)
                            .font(.body)
                    } else {
                        Text(content)
                            .textSelection(.enabled)
                            .font(.body)
                    }

                case .code(let language, let content):
                    CodeBlockView(language: language, code: content)

                case .blockquote(let content):
                    HStack(spacing: 0) {
                        RoundedRectangle(cornerRadius: 1)
                            .fill(Color.secondary.opacity(0.4))
                            .frame(width: 3)
                        Text(content)
                            .font(.body)
                            .foregroundStyle(.secondary)
                            .padding(.leading, 12)
                            .textSelection(.enabled)
                    }
                    .padding(.vertical, 4)

                case .table(let rows):
                    TableBlockView(rows: rows)
                }
            }
        }
    }
}

// MARK: - Code block with copy button and syntax highlighting

private struct CodeBlockView: View {
    let language: String?
    let code: String
    @State private var showCopied = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header: language badge + copy button
            HStack {
                if let language, !language.isEmpty {
                    Text(language)
                        .font(.caption2.bold())
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button {
                    UIPasteboard.general.string = code
                    showCopied = true
                    HapticManager.notification(.success)
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                        showCopied = false
                    }
                } label: {
                    Label(showCopied ? L10n.copied : L10n.copyCode,
                          systemImage: showCopied ? "checkmark" : "doc.on.doc")
                        .font(.caption2)
                        .foregroundStyle(showCopied ? .green : .secondary)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 12)
            .padding(.top, 8)
            .padding(.bottom, 4)

            // Code content with syntax highlighting
            ScrollView(.horizontal, showsIndicators: false) {
                Text(highlightedCode(code, language: language))
                    .font(.system(.callout, design: .monospaced))
                    .textSelection(.enabled)
                    .padding(.horizontal, 12)
                    .padding(.bottom, 12)
            }
        }
        .background(Color(.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

// MARK: - Table block

private struct TableBlockView: View {
    let rows: [[String]]

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.offset) { rowIdx, row in
                HStack(spacing: 0) {
                    ForEach(Array(row.enumerated()), id: \.offset) { _, cell in
                        Text(cell.trimmingCharacters(in: .whitespaces))
                            .font(rowIdx == 0 ? .caption.bold() : .caption)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 6)
                    }
                }
                .background(rowIdx == 0 ? Color(.systemGray5) : (rowIdx % 2 == 0 ? Color(.systemGray6) : .clear))
                if rowIdx == 0 {
                    Divider()
                }
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 6))
        .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color(.systemGray4), lineWidth: 0.5))
    }
}

// MARK: - Basic syntax highlighting

private func highlightedCode(_ code: String, language: String?) -> AttributedString {
    var result = AttributedString(code)

    // Keywords by language
    let keywords: [String]
    switch language?.lowercased() {
    case "swift":
        keywords = ["func", "var", "let", "if", "else", "for", "while", "return", "import", "struct", "class", "enum", "protocol", "guard", "switch", "case", "break", "continue", "self", "true", "false", "nil", "async", "await", "throws", "try", "catch", "private", "public", "static", "final", "override", "init", "deinit", "some", "any"]
    case "typescript", "ts", "javascript", "js":
        keywords = ["function", "const", "let", "var", "if", "else", "for", "while", "return", "import", "export", "class", "interface", "type", "enum", "switch", "case", "break", "continue", "this", "true", "false", "null", "undefined", "async", "await", "throw", "try", "catch", "new", "delete", "typeof", "instanceof", "from", "default", "extends", "implements", "readonly"]
    case "python", "py":
        keywords = ["def", "class", "if", "elif", "else", "for", "while", "return", "import", "from", "as", "try", "except", "finally", "raise", "with", "yield", "lambda", "pass", "break", "continue", "and", "or", "not", "in", "is", "None", "True", "False", "self", "async", "await"]
    case "go", "golang":
        keywords = ["func", "var", "const", "if", "else", "for", "range", "return", "import", "package", "struct", "interface", "type", "switch", "case", "break", "continue", "go", "defer", "select", "chan", "map", "make", "new", "nil", "true", "false"]
    case "bash", "sh", "shell", "zsh":
        keywords = ["if", "then", "else", "elif", "fi", "for", "while", "do", "done", "case", "esac", "function", "return", "exit", "echo", "export", "local", "readonly", "set", "unset", "shift", "in"]
    case "rust", "rs":
        keywords = ["fn", "let", "mut", "if", "else", "for", "while", "loop", "return", "use", "mod", "pub", "struct", "enum", "impl", "trait", "match", "self", "super", "crate", "true", "false", "async", "await", "move", "ref", "where", "type", "const", "static", "unsafe"]
    default:
        keywords = ["function", "func", "def", "class", "if", "else", "for", "while", "return", "import", "var", "let", "const", "true", "false", "null", "nil", "self", "this"]
    }

    // Apply keyword highlighting
    for keyword in keywords {
        let pattern = "\\b\(keyword)\\b"
        guard let regex = try? NSRegularExpression(pattern: pattern) else { continue }
        let nsString = code as NSString
        let matches = regex.matches(in: code, range: NSRange(location: 0, length: nsString.length))
        for match in matches {
            guard let range = Range(match.range, in: code),
                  let attrRange = Range(range, in: result) else { continue }
            result[attrRange].foregroundColor = .purple
        }
    }

    // Highlight strings (double-quoted and single-quoted)
    for pattern in ["\"[^\"\\\\]*(?:\\\\.[^\"\\\\]*)*\"", "'[^'\\\\]*(?:\\\\.[^'\\\\]*)*'"] {
        guard let regex = try? NSRegularExpression(pattern: pattern) else { continue }
        let nsString = code as NSString
        let matches = regex.matches(in: code, range: NSRange(location: 0, length: nsString.length))
        for match in matches {
            guard let range = Range(match.range, in: code),
                  let attrRange = Range(range, in: result) else { continue }
            result[attrRange].foregroundColor = .init(red: 0.77, green: 0.26, blue: 0.18) // reddish-brown
        }
    }

    // Highlight comments (// and #)
    for pattern in ["//.*$", "#.*$"] {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: .anchorsMatchLines) else { continue }
        let nsString = code as NSString
        let matches = regex.matches(in: code, range: NSRange(location: 0, length: nsString.length))
        for match in matches {
            guard let range = Range(match.range, in: code),
                  let attrRange = Range(range, in: result) else { continue }
            result[attrRange].foregroundColor = .gray
        }
    }

    // Highlight numbers
    if let regex = try? NSRegularExpression(pattern: "\\b\\d+\\.?\\d*\\b") {
        let nsString = code as NSString
        let matches = regex.matches(in: code, range: NSRange(location: 0, length: nsString.length))
        for match in matches {
            guard let range = Range(match.range, in: code),
                  let attrRange = Range(range, in: result) else { continue }
            result[attrRange].foregroundColor = .init(red: 0.1, green: 0.5, blue: 0.8) // blue
        }
    }

    return result
}

// MARK: - Parsing

private enum TextBlock {
    case text(String)
    case code(language: String?, content: String)
    case blockquote(String)
    case table([[String]])
}

private func parseCodeBlocks(_ text: String) -> [TextBlock] {
    var blocks: [TextBlock] = []
    let lines = text.components(separatedBy: "\n")
    var i = 0
    var currentText: [String] = []

    func flushText() {
        let joined = currentText.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
        if !joined.isEmpty {
            blocks.append(.text(joined))
        }
        currentText = []
    }

    while i < lines.count {
        let line = lines[i]

        // Code block: ```lang ... ```
        if line.hasPrefix("```") {
            flushText()
            let lang = String(line.dropFirst(3)).trimmingCharacters(in: .whitespaces)
            var codeLines: [String] = []
            i += 1
            while i < lines.count && !lines[i].hasPrefix("```") {
                codeLines.append(lines[i])
                i += 1
            }
            blocks.append(.code(
                language: lang.isEmpty ? nil : lang,
                content: codeLines.joined(separator: "\n")
            ))
            i += 1
            continue
        }

        // Blockquote: > text
        if line.hasPrefix("> ") || line == ">" {
            flushText()
            var quoteLines: [String] = []
            while i < lines.count && (lines[i].hasPrefix("> ") || lines[i] == ">") {
                quoteLines.append(String(lines[i].dropFirst(lines[i] == ">" ? 1 : 2)))
                i += 1
            }
            blocks.append(.blockquote(quoteLines.joined(separator: "\n")))
            continue
        }

        // Table: | col | col |
        if line.contains("|") && line.trimmingCharacters(in: .whitespaces).hasPrefix("|") {
            // Check next line for separator (|---|---|)
            let nextIdx = i + 1
            if nextIdx < lines.count && lines[nextIdx].contains("---") {
                flushText()
                var tableRows: [[String]] = []
                // Header row
                tableRows.append(parseTableRow(line))
                i += 2  // Skip header and separator
                while i < lines.count && lines[i].contains("|") && lines[i].trimmingCharacters(in: .whitespaces).hasPrefix("|") {
                    tableRows.append(parseTableRow(lines[i]))
                    i += 1
                }
                blocks.append(.table(tableRows))
                continue
            }
        }

        currentText.append(line)
        i += 1
    }

    flushText()

    if blocks.isEmpty {
        blocks.append(.text(text))
    }

    return blocks
}

private func parseTableRow(_ row: String) -> [String] {
    row.split(separator: "|", omittingEmptySubsequences: false)
        .map { String($0).trimmingCharacters(in: .whitespaces) }
        .filter { !$0.isEmpty }
}
