import Foundation

extension Date {
    private static let relativeFormatter: RelativeDateTimeFormatter = {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter
    }()

    private static let shortTimeFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.timeStyle = .short
        formatter.dateStyle = .none
        return formatter
    }()

    /// Returns a relative time string like "2m ago", "3h ago", "Yesterday".
    var relativeString: String {
        Self.relativeFormatter.localizedString(for: self, relativeTo: .now)
    }

    /// Returns a short time string like "14:30" or "2:30 PM".
    var shortTimeString: String {
        Self.shortTimeFormatter.string(from: self)
    }
}
