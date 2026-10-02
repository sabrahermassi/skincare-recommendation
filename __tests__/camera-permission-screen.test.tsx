import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { CameraPermissionScreen } from "@/components/CameraPermissionScreen";

/**
 * The camera-off screen (v9): one title, one line and one button per state,
 * no Search link, and Photo mode's own way on without a camera.
 */

jest.mock("expo-image", () => {
  const { View } = jest.requireActual("react-native");
  return { Image: (props: object) => <View testID="image" {...props} /> };
});

type Permission = Parameters<typeof CameraPermissionScreen>[0]["permission"];
const notAsked = { granted: false, canAskAgain: true } as Permission;
const refused = { granted: false, canAskAgain: false } as Permission;

const STATES: ["barcode" | "photo", Permission, string, string, string][] = [
  ["barcode", notAsked, "Scan a barcode", "Point your camera at the barcode on the pack. We only use it while you scan.", "Turn on the camera"],
  ["photo", notAsked, "Scan the ingredient list", "Take a photo of the list on the back and we'll read it for you.", "Turn on the camera"],
  ["barcode", refused, "The camera is off", "Turn it on in Settings to scan products.", "Open Settings"],
];

it.each(STATES)("in %s mode says what it needs", async (mode: "barcode" | "photo", permission: Permission, title: string, line: string, action: string) => {
  await render(<CameraPermissionScreen permission={permission} requestPermission={() => undefined} mode={mode} topInset={0} bottomInset={0} />);
  expect(screen.getByRole("header", { name: title })).toBeTruthy();
  expect(screen.getByText(line)).toBeTruthy();
  expect(screen.getByRole("button", { name: action })).toBeTruthy();
  expect(screen.queryByText(/Search/)).toBeNull();
});

it("asks for the camera from the button, and shows the photo way on beside it", async () => {
  const requestPermission = jest.fn();
  await render(
    <CameraPermissionScreen
      permission={notAsked}
      requestPermission={requestPermission}
      mode="photo"
      topInset={0}
      bottomInset={0}
      extra={<Text>Choose a photo instead</Text>}
    />,
  );
  expect(screen.getByText("Choose a photo instead")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Turn on the camera" }));
  expect(requestPermission).toHaveBeenCalledTimes(1);
});
