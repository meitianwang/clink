import SwiftUI
import MarkdownUI

/// Professional markdown renderer using MarkdownUI with custom code block (copy button + syntax highlighting).
struct MarkdownText: View {
    let text: String

    init(_ text: String) {
        self.text = text
    }

    var body: some View {
        Markdown(text)
            .markdownTheme(.klaus)
            .markdownCodeSyntaxHighlighter(KlausSyntaxHighlighter())
            .textSelection(.enabled)
    }
}

// MARK: - Klaus Theme

extension MarkdownUI.Theme {
    static let klaus = Theme()
        // Headings
        .heading1 { configuration in
            configuration.label
                .markdownTextStyle { FontSize(20); FontWeight(.bold) }
                .padding(.bottom, 4)
        }
        .heading2 { configuration in
            configuration.label
                .markdownTextStyle { FontSize(17); FontWeight(.bold) }
                .padding(.bottom, 2)
        }
        .heading3 { configuration in
            configuration.label
                .markdownTextStyle { FontSize(15); FontWeight(.semibold) }
                .padding(.bottom, 2)
        }
        .heading4 { configuration in
            configuration.label
                .markdownTextStyle { FontSize(14); FontWeight(.semibold) }
        }
        // Paragraph
        .paragraph { configuration in
            configuration.label
                .markdownTextStyle { FontSize(14.5) }
        }
        // Inline code
        .code {
            FontSize(12.5)
            FontFamily(.custom("Menlo"))
            BackgroundColor(Color(.systemGray6))
        }
        // Code block
        .codeBlock { configuration in
            CodeBlockCard(configuration: configuration)
        }
        // Blockquote
        .blockquote { configuration in
            HStack(spacing: 0) {
                RoundedRectangle(cornerRadius: 1)
                    .fill(Color.accentColor.opacity(0.5))
                    .frame(width: 3)
                configuration.label
                    .markdownTextStyle {
                        FontSize(14)
                        ForegroundColor(.secondary)
                    }
                    .padding(.leading, 12)
            }
            .padding(.vertical, 2)
        }
        // Table
        .table { configuration in
            configuration.label
                .markdownTableBorderStyle(
                    .init(color: Color(.systemGray4), strokeStyle: .init(lineWidth: 0.5))
                )
                .markdownTableBackgroundStyle(
                    .alternatingRows(Color(.systemGray6), .clear, header: Color(.systemGray5))
                )
                .clipShape(RoundedRectangle(cornerRadius: 6))
        }
        // Thematic break (horizontal rule)
        .thematicBreak {
            Divider()
                .padding(.vertical, 4)
        }
        // List items
        .listItem { configuration in
            configuration.label
                .markdownTextStyle { FontSize(14.5) }
        }
}

// MARK: - Code block with copy button

private struct CodeBlockCard: View {
    let configuration: CodeBlockConfiguration
    @State private var showCopied = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header: language + copy
            HStack {
                if let language = configuration.language, !language.isEmpty {
                    Text(language)
                        .font(.caption2.bold())
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button {
                    UIPasteboard.general.string = configuration.content
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

            // Code content
            ScrollView(.horizontal, showsIndicators: false) {
                configuration.label
                    .markdownTextStyle {
                        FontSize(13)
                        FontFamily(.custom("Menlo"))
                    }
                    .padding(.horizontal, 12)
                    .padding(.bottom, 12)
            }
        }
        .background(Color(.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

// MARK: - Syntax Highlighter

private struct KlausSyntaxHighlighter: CodeSyntaxHighlighter {
    func highlightCode(_ code: String, language: String?) -> Text {
        let highlighted = highlightedAttributedString(code, language: language)
        return Text(highlighted)
    }
}

private func highlightedAttributedString(_ code: String, language: String?) -> AttributedString {
    var result = AttributedString(code)

    let keywords: [String]
    switch language?.lowercased() {
    case "swift":
        keywords = ["func", "var", "let", "if", "else", "for", "while", "return", "import", "struct", "class", "enum", "protocol", "guard", "switch", "case", "break", "continue", "self", "true", "false", "nil", "async", "await", "throws", "try", "catch", "private", "public", "static", "final", "override", "init", "deinit", "some", "any", "where", "typealias", "extension", "mutating", "weak", "unowned"]
    case "typescript", "ts", "javascript", "js":
        keywords = ["function", "const", "let", "var", "if", "else", "for", "while", "return", "import", "export", "class", "interface", "type", "enum", "switch", "case", "break", "continue", "this", "true", "false", "null", "undefined", "async", "await", "throw", "try", "catch", "new", "delete", "typeof", "instanceof", "from", "default", "extends", "implements", "readonly", "void", "never", "any", "string", "number", "boolean"]
    case "python", "py":
        keywords = ["def", "class", "if", "elif", "else", "for", "while", "return", "import", "from", "as", "try", "except", "finally", "raise", "with", "yield", "lambda", "pass", "break", "continue", "and", "or", "not", "in", "is", "None", "True", "False", "self", "async", "await", "global", "nonlocal"]
    case "go", "golang":
        keywords = ["func", "var", "const", "if", "else", "for", "range", "return", "import", "package", "struct", "interface", "type", "switch", "case", "break", "continue", "go", "defer", "select", "chan", "map", "make", "new", "nil", "true", "false"]
    case "bash", "sh", "shell", "zsh":
        keywords = ["if", "then", "else", "elif", "fi", "for", "while", "do", "done", "case", "esac", "function", "return", "exit", "echo", "export", "local", "readonly", "set", "unset", "shift", "in"]
    case "rust", "rs":
        keywords = ["fn", "let", "mut", "if", "else", "for", "while", "loop", "return", "use", "mod", "pub", "struct", "enum", "impl", "trait", "match", "self", "super", "crate", "true", "false", "async", "await", "move", "ref", "where", "type", "const", "static", "unsafe"]
    default:
        keywords = ["function", "func", "def", "class", "if", "else", "for", "while", "return", "import", "var", "let", "const", "true", "false", "null", "nil", "self", "this"]
    }

    // Keywords
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

    // Strings
    for pattern in ["\"[^\"\\\\]*(?:\\\\.[^\"\\\\]*)*\"", "'[^'\\\\]*(?:\\\\.[^'\\\\]*)*'"] {
        guard let regex = try? NSRegularExpression(pattern: pattern) else { continue }
        let nsString = code as NSString
        let matches = regex.matches(in: code, range: NSRange(location: 0, length: nsString.length))
        for match in matches {
            guard let range = Range(match.range, in: code),
                  let attrRange = Range(range, in: result) else { continue }
            result[attrRange].foregroundColor = .init(red: 0.77, green: 0.26, blue: 0.18)
        }
    }

    // Comments
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

    // Numbers
    if let regex = try? NSRegularExpression(pattern: "\\b\\d+\\.?\\d*\\b") {
        let nsString = code as NSString
        let matches = regex.matches(in: code, range: NSRange(location: 0, length: nsString.length))
        for match in matches {
            guard let range = Range(match.range, in: code),
                  let attrRange = Range(range, in: result) else { continue }
            result[attrRange].foregroundColor = .init(red: 0.1, green: 0.5, blue: 0.8)
        }
    }

    return result
}
