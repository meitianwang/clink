// swift-tools-version: 6.0
// Klaus macOS companion app — menu bar app + IPC library.

import PackageDescription

let package = Package(
    name: "Klaus",
    platforms: [
        .macOS(.v14),
    ],
    products: [
        .library(name: "KlausIPC", targets: ["KlausIPC"]),
        .executable(name: "Klaus", targets: ["Klaus"]),
    ],
    dependencies: [
        .package(url: "https://github.com/orchetect/MenuBarExtraAccess", exact: "1.2.2"),
        .package(url: "https://github.com/apple/swift-log.git", from: "1.8.0"),
        .package(url: "https://github.com/sparkle-project/Sparkle", from: "2.8.1"),
    ],
    targets: [
        .target(
            name: "KlausIPC",
            dependencies: [],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .executableTarget(
            name: "Klaus",
            dependencies: [
                "KlausIPC",
                .product(name: "MenuBarExtraAccess", package: "MenuBarExtraAccess"),
                .product(name: "Logging", package: "swift-log"),
                .product(name: "Sparkle", package: "Sparkle"),
            ],
            exclude: [
                "Resources/Info.plist",
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
    ])
