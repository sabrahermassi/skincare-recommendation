/**
 * AsyncStorage is a native module, so the real one throws under Jest. The
 * package ships an in-memory mock for exactly this. Registered via
 * `setupFilesAfterEnv` rather than `setupFiles` because jest-expo's preset
 * already populates `setupFiles`, and a project-level array would replace it.
 */
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

// Reanimated's native side (and the worklets under it) doesn't exist under
// Jest. Their own mocks stand in
// for every suite, since the switch every screen uses (SegmentedSwitch) and
// the tab bar animate with it.
jest.mock("react-native-worklets", () => require("react-native-worklets/src/mock"));
jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));
