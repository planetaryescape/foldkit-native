import UIKit

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    private var counterController: CounterViewController?

    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        connect(scene)
    }

    func sceneWillEnterForeground(_ scene: UIScene) {
        if window == nil { connect(scene) }
    }

    func sceneDidDisconnect(_ scene: UIScene) {
        counterController?.shutdown()
        window?.isHidden = true
        window?.rootViewController = nil
        window = nil
        counterController = nil
    }

    private func connect(_ scene: UIScene) {
        guard window == nil, let windowScene = scene as? UIWindowScene else { return }
        let controller = CounterViewController()
        let window = UIWindow(windowScene: windowScene)
        window.rootViewController = controller
        counterController = controller
        self.window = window
        window.makeKeyAndVisible()
    }
}
