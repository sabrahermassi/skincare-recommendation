/**
 * Expo UI's SwiftUI views are native iOS views with no JS fallback, so under
 * Jest a `Button` stands in as an ordinary labelled button (what VoiceOver
 * reads the real one as) and `Host` just renders its children. The props the
 * SwiftUI button was given ride along, for a test that wants to check them.
 *
 * A root `__mocks__` file rather than a `jest.mock` in jest.setup.js: it is
 * loaded only when something first imports `@expo/ui/swift-ui`, after a test's
 * own mocks (AppState) are in place.
 */
const { Pressable, View } = require("react-native");

const Host = ({ children, style }) => <View style={style}>{children}</View>;

const Button = ({ label, onPress, systemImage, modifiers }) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    onPress={onPress}
    testID="swiftui-button"
    systemImage={systemImage}
    modifiers={modifiers}
  />
);

module.exports = { Host, Button };
