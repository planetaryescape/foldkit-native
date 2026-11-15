// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "FoldkitNativeApple",
    platforms: [.macOS(.v13), .iOS(.v16)],
    products: [
        .library(name: "CounterRuntime", targets: ["CounterRuntime"]),
        .executable(name: "HostProbe", targets: ["HostProbe"])
    ],
    targets: [
        .target(name: "CounterRuntime", path: "Sources/HostRuntime", linkerSettings: [.linkedFramework("JavaScriptCore")]),
        .executableTarget(name: "HostProbe", dependencies: ["CounterRuntime"], path: "Sources/HostProbe")
    ]
)
