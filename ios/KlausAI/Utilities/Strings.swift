import Foundation

/// Bilingual string system matching Web frontend's i18n.
enum L10n {
    // Auth
    static let appName = "Klaus AI"
    static let serverLabel = "服务器"
    static let emailPlaceholder = "邮箱"
    static let passwordPlaceholder = "密码"
    static let passwordHint = "密码（至少 8 位）"
    static let displayNamePlaceholder = "昵称"
    static let inviteCodePlaceholder = "邀请码"
    static let loginButton = "登录"
    static let registerButton = "注册"
    static let switchToRegister = "没有账号？注册"
    static let switchToLogin = "已有账号？登录"
    static let loggingIn = "登录中..."
    static let registering = "注册中..."

    // Chat
    static let newChat = "新对话"
    static let messagePlaceholder = "输入消息..."
    static let conversations = "对话列表"
    static let noConversations = "暂无对话"
    static let startNewChat = "开始新对话吧"
    static let thinking = "思考中..."
    static let sending = "发送中..."

    // Connection
    static let connected = "已连接"
    static let connecting = "连接中..."
    static let disconnected = "已断开"
    static let reconnecting = "重新连接中..."

    // Settings
    static let settings = "设置"
    static let account = "账户"
    static let nameLabel = "昵称"
    static let emailLabel = "邮箱"
    static let roleLabel = "角色"
    static let serverSection = "服务器"
    static let serverURLLabel = "服务器地址"
    static let about = "关于"
    static let version = "版本"
    static let platform = "平台"
    static let logOut = "退出登录"
    static let logOutConfirm = "确定退出？"
    static let done = "完成"

    // Permissions
    static let permissionTitle = "权限请求"
    static let allow = "允许"
    static let deny = "拒绝"
    static let toolLabel = "工具"
    static let actionLabel = "操作"
    static let detailsLabel = "详情"
    static let reasonLabel = "原因"

    // Files
    static let uploadFailed = "上传失败"
    static let copied = "已复制"
    static let copyCode = "复制"
    static let downloadFile = "下载文件"

    // Errors
    static let dismiss = "关闭"
    static let configUpdated = "配置已更新，部分设置需要重启生效"

    // Slash commands
    static let helpText = """
        可用命令:
        /new — 新建对话
        /clear — 清空当前对话
        /model [名称] — 查看或切换模型
        /session — 当前会话信息
        /help — 显示此帮助
        """
    static let sessionCleared = "对话已清空"
    static let newSessionCreated = "已创建新对话"

    // Error code mappings (matching Web frontend)
    static func mapErrorCode(_ code: String) -> String {
        switch code {
        case "invalid_credentials": return "邮箱或密码错误"
        case "email_already_registered": return "该邮箱已注册"
        case "invite_code_required": return "需要邀请码"
        case "invalid_email": return "邮箱格式不正确"
        case "password_too_short": return "密码至少 8 位"
        case "display_name_required": return "请输入昵称"
        case "invalid_invite_code": return "邀请码无效或已使用"
        case "too_many_requests": return "请求过于频繁，请稍后再试"
        case "not_authenticated": return "请重新登录"
        default: return code
        }
    }
}
