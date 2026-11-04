import SwiftUI

// iOS 18 fallbacks for iOS 26 APIs (the app supports iOS 18 and up). On iOS
// 26 these give the new look; earlier versions get the standard control.

extension ButtonRole {
    // iOS 26 draws these as the ✓ / ✕ toolbar buttons; before that a
    // plain text button.
    static var confirmIfAvailable: ButtonRole? {
        if #available(iOS 26.0, *) { .confirm } else { nil }
    }

    static var closeIfAvailable: ButtonRole? {
        if #available(iOS 26.0, *) { .close } else { nil }
    }
}
